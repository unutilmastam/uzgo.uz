import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/http-exception.filter.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { somStringToTiyin } from '../payment-links.js';
import { PaymentsService } from '../payments.service.js';

type Tx = Prisma.TransactionClient;

/** Click SHOP API error codes (ADR 0017 — verify against docs.click.uz). */
export const ClickError = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  BAD_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

const NOTES: Record<number, string> = {
  0: 'Success',
  [-1]: 'SIGN CHECK FAILED!',
  [-2]: 'Incorrect parameter amount',
  [-3]: 'Action not found',
  [-4]: 'Already paid',
  [-5]: 'User does not exist',
  [-6]: 'Transaction does not exist',
  [-8]: 'Error in request from click',
  [-9]: 'Transaction cancelled',
};

/** Prepare (action 0) and Complete (action 1) fields; Click sends them form-encoded. */
export type ClickRequest = Record<string, string | undefined>;

const REQUIRED = [
  'click_trans_id',
  'service_id',
  'merchant_trans_id',
  'amount',
  'action',
  'error',
  'sign_time',
  'sign_string',
] as const;

class ClickFailure extends Error {
  constructor(readonly code: number) {
    super(NOTES[code] ?? 'Error');
  }
}

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

/** Constant-time comparison of two lowercase hex strings. */
function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase());
  const right = Buffer.from(b.toLowerCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Click SHOP API: Click calls Prepare, charges the card, then calls Complete.
 * Requests are authenticated with an MD5 `sign_string` over the fields plus
 * the merchant SECRET_KEY; the amount (soʻm with decimals) is converted to
 * tiyin with integer arithmetic and must match the order exactly.
 */
@Injectable()
export class ClickService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** md5(click_trans_id + service_id + SECRET + merchant_trans_id + [merchant_prepare_id] + amount + action + sign_time) */
  expectedSign(req: ClickRequest, withPrepareId: boolean): string {
    return md5(
      [
        req.click_trans_id,
        req.service_id,
        this.env.CLICK_SECRET_KEY,
        req.merchant_trans_id,
        ...(withPrepareId ? [req.merchant_prepare_id] : []),
        req.amount,
        req.action,
        req.sign_time,
      ].join(''),
    );
  }

  private verify(req: ClickRequest, action: '0' | '1'): bigint {
    if (!this.env.CLICK_SECRET_KEY || !this.env.CLICK_SERVICE_ID) {
      throw new ClickFailure(ClickError.SIGN_CHECK_FAILED);
    }
    if (REQUIRED.some((field) => typeof req[field] !== 'string' || req[field] === '')) {
      throw new ClickFailure(ClickError.BAD_REQUEST);
    }
    if (action === '1' && !/^\d{1,18}$/.test(req.merchant_prepare_id ?? '')) {
      throw new ClickFailure(ClickError.BAD_REQUEST);
    }
    // The signature formula depends on the action, so check it first.
    if (req.action !== action) throw new ClickFailure(ClickError.ACTION_NOT_FOUND);
    if (!sameHex(req.sign_string ?? '', this.expectedSign(req, action === '1'))) {
      throw new ClickFailure(ClickError.SIGN_CHECK_FAILED);
    }
    if (req.service_id !== this.env.CLICK_SERVICE_ID) {
      throw new ClickFailure(ClickError.BAD_REQUEST);
    }
    if (!/^\d{1,20}$/.test(req.click_trans_id ?? '')) {
      throw new ClickFailure(ClickError.BAD_REQUEST);
    }
    const amount = somStringToTiyin(req.amount ?? '');
    if (amount === null || amount <= 0n) throw new ClickFailure(ClickError.INCORRECT_AMOUNT);
    return amount;
  }

  private respond(req: ClickRequest, code: number, extra: Record<string, unknown> = {}) {
    return {
      click_trans_id: req.click_trans_id ?? null,
      merchant_trans_id: req.merchant_trans_id ?? null,
      ...extra,
      error: code,
      error_note: NOTES[code] ?? 'Error',
    };
  }

  private async orderFor(tx: Tx, req: ClickRequest, amount: bigint) {
    const found = await tx.order.findUnique({
      where: { number: req.merchant_trans_id ?? '' },
      select: { id: true },
    });
    if (!found) throw new ClickFailure(ClickError.ORDER_NOT_FOUND);
    const order = await this.payments.lockOrder(tx, found.id);
    if (!order || order.paymentMethod !== 'CLICK')
      throw new ClickFailure(ClickError.ORDER_NOT_FOUND);
    if (order.paidAt !== null) throw new ClickFailure(ClickError.ALREADY_PAID);
    if (!this.payments.isCollectable(order, 'CLICK')) {
      throw new ClickFailure(ClickError.TRANSACTION_CANCELLED);
    }
    if (amount !== order.totalTiyin) throw new ClickFailure(ClickError.INCORRECT_AMOUNT);
    return order;
  }

  async prepare(req: ClickRequest) {
    try {
      const amount = this.verify(req, '0');
      // Click reports its own failure (error < 0): nothing to prepare.
      if (Number(req.error) < 0) throw new ClickFailure(ClickError.TRANSACTION_CANCELLED);
      const attempt = await this.prisma.$transaction(async (tx) => {
        const order = await this.orderFor(tx, req, amount);
        const existing = await tx.paymentAttempt.findUnique({
          where: {
            method_providerTxId: { method: 'CLICK', providerTxId: req.click_trans_id ?? '' },
          },
        });
        if (existing) {
          if (existing.orderId !== order.id) throw new ClickFailure(ClickError.BAD_REQUEST);
          if (existing.status === 'CANCELLED') {
            throw new ClickFailure(ClickError.TRANSACTION_CANCELLED);
          }
          return existing;
        }
        return tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            method: 'CLICK',
            amountTiyin: amount,
            providerTxId: req.click_trans_id ?? '',
            providerState: 0,
          },
        });
      });
      return this.respond(req, ClickError.SUCCESS, {
        merchant_prepare_id: Number(attempt.seq),
      });
    } catch (e) {
      return this.failure(req, e);
    }
  }

  async complete(req: ClickRequest) {
    try {
      const amount = this.verify(req, '1');
      const result = await this.prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "PaymentAttempt"
          WHERE "method" = 'CLICK' AND "seq" = ${BigInt(req.merchant_prepare_id ?? '0')}
            AND "providerTxId" = ${req.click_trans_id ?? ''}
          FOR UPDATE`;
        if (!row) throw new ClickFailure(ClickError.TRANSACTION_NOT_FOUND);
        const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: row.id } });
        if (attempt.amountTiyin !== amount) throw new ClickFailure(ClickError.INCORRECT_AMOUNT);
        // Repeated Complete for the same, already captured transaction: same answer.
        if (attempt.status === 'PAID') return { seq: attempt.seq, cancelled: false };
        if (attempt.status !== 'PENDING') return { seq: attempt.seq, cancelled: true };
        // Click reports that the card charge failed: cancel our side.
        if (Number(req.error) < 0) {
          await this.payments.cancelAttempt(tx, attempt.id, Number(req.error), -1);
          return { seq: attempt.seq, cancelled: true };
        }
        try {
          await this.payments.capture(tx, attempt.id, 1);
        } catch (e) {
          if (!(e instanceof AppException)) throw e;
          // The order can no longer take this money (expired or cancelled): refuse,
          // so Click reverses the charge, and record the attempt as cancelled.
          // capture() checks before writing, so nothing else changed in this transaction.
          await this.payments.cancelAttempt(tx, attempt.id, null, -1);
          return { seq: attempt.seq, cancelled: true };
        }
        return { seq: attempt.seq, cancelled: false };
      });
      if (result.cancelled) throw new ClickFailure(ClickError.TRANSACTION_CANCELLED);
      return this.respond(req, ClickError.SUCCESS, { merchant_confirm_id: Number(result.seq) });
    } catch (e) {
      return this.failure(req, e);
    }
  }

  private failure(req: ClickRequest, e: unknown) {
    if (e instanceof ClickFailure) return this.respond(req, e.code);
    throw e;
  }
}
