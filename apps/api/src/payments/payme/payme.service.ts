import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/http-exception.filter.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentsService } from '../payments.service.js';

type Tx = Prisma.TransactionClient;
type Localized = { ru: string; uz: string; en: string };

/** Payme keeps a created transaction open for 12 hours (ADR 0017 — verify). */
export const PAYME_TX_TIMEOUT_MS = 43_200_000;

/** Payme transaction states. */
export const PaymeState = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1,
  CANCELLED_AFTER_PERFORM: -2,
} as const;

/** Payme cancel reason 4: cancelled by timeout. */
const REASON_TIMEOUT = 4;

/** A JSON-RPC error Payme understands (HTTP status is always 200). */
export class PaymeError extends Error {
  constructor(
    readonly code: number,
    readonly text: Localized,
    readonly data?: string,
  ) {
    super(text.en);
  }
}

const err = {
  auth: () =>
    new PaymeError(-32504, {
      ru: 'Недостаточно привилегий',
      uz: 'Ruxsat yetarli emas',
      en: 'Insufficient privileges',
    }),
  method: (name: string) =>
    new PaymeError(
      -32601,
      { ru: 'Метод не найден', uz: 'Metod topilmadi', en: 'Method not found' },
      name,
    ),
  request: () =>
    new PaymeError(-32600, {
      ru: 'Неверный запрос',
      uz: 'Notoʻgʻri soʻrov',
      en: 'Invalid request',
    }),
  amount: () =>
    new PaymeError(-31001, {
      ru: 'Неверная сумма',
      uz: 'Notoʻgʻri summa',
      en: 'Incorrect amount',
    }),
  notFound: () =>
    new PaymeError(-31003, {
      ru: 'Транзакция не найдена',
      uz: 'Tranzaksiya topilmadi',
      en: 'Transaction not found',
    }),
  cannotPerform: () =>
    new PaymeError(-31008, {
      ru: 'Невозможно выполнить операцию',
      uz: 'Amalni bajarib boʻlmaydi',
      en: 'Unable to perform operation',
    }),
  cannotCancel: () =>
    new PaymeError(-31007, {
      ru: 'Заказ уже передан в доставку, отмена невозможна',
      uz: 'Buyurtma yetkazishga topshirilgan, bekor qilib boʻlmaydi',
      en: 'Order already shipped, cannot cancel',
    }),
  orderNotFound: () =>
    new PaymeError(
      -31050,
      { ru: 'Заказ не найден', uz: 'Buyurtma topilmadi', en: 'Order not found' },
      'order_id',
    ),
  orderNotPayable: () =>
    new PaymeError(
      -31051,
      {
        ru: 'Заказ недоступен для оплаты',
        uz: 'Buyurtmani toʻlab boʻlmaydi',
        en: 'Order is not available for payment',
      },
      'order_id',
    ),
};

type Params = Record<string, unknown>;

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

/**
 * Payme Merchant API (JSON-RPC 2.0, Payme calls us). Every method follows the
 * provider protocol; the money rules live in PaymentsService.
 */
@Injectable()
export class PaymeService {
  private readonly logger = new Logger(PaymeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** `Authorization: Basic base64("Paycom:<KEY>")`, compared in constant time. */
  authorize(header: string | undefined): void {
    const key = this.env.PAYME_KEY;
    if (!key || !this.env.PAYME_MERCHANT_ID || !header?.startsWith('Basic ')) throw err.auth();
    const given = Buffer.from(header.slice(6).trim(), 'base64');
    const expected = Buffer.from(`Paycom:${key}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw err.auth();
  }

  async dispatch(method: unknown, params: unknown): Promise<unknown> {
    if (typeof method !== 'string' || !params || typeof params !== 'object') throw err.request();
    const p = params as Params;
    switch (method) {
      case 'CheckPerformTransaction':
        return this.checkPerform(p);
      case 'CreateTransaction':
        return this.create(p);
      case 'PerformTransaction':
        return this.perform(p);
      case 'CancelTransaction':
        return this.cancel(p);
      case 'CheckTransaction':
        return this.check(p);
      case 'GetStatement':
        return this.statement(p);
      case 'SetFiscalData':
        return this.setFiscalData(p);
      default:
        throw err.method(method);
    }
  }

  private orderNumberOf(p: Params): string {
    const account = p.account as Params | undefined;
    const number = account?.order_id;
    if (typeof number !== 'string' || !/^UZ-\d{4}-\d{6,}$/.test(number)) throw err.orderNotFound();
    return number;
  }

  /** Order exists, is a Payme order, still payable, and the amount matches exactly. */
  private async validateOrder(tx: Tx, p: Params) {
    if (!isInt(p.amount) || p.amount <= 0) throw err.amount();
    const found = await tx.order.findUnique({
      where: { number: this.orderNumberOf(p) },
      select: { id: true },
    });
    if (!found) throw err.orderNotFound();
    const order = await this.payments.lockOrder(tx, found.id);
    if (!order) throw err.orderNotFound();
    if (!this.payments.isCollectable(order, 'PAYME')) throw err.orderNotPayable();
    if (BigInt(p.amount) !== order.totalTiyin) throw err.amount();
    return order;
  }

  /** Receipt lines for the fiscal receipt (IKPU, package code, VAT, seller TIN). */
  private async receiptDetail(orderId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { sellerOrder: { orderId } },
      orderBy: { createdAt: 'asc' },
      select: {
        title: true,
        unitPriceTiyin: true,
        quantity: true,
        mxikCode: true,
        packageCode: true,
        vatRateBp: true,
        sellerOrder: { select: { store: { select: { taxId: true } } } },
      },
    });
    return {
      receipt_type: 0,
      items: items.map((item) => ({
        title: (item.title as { uz: string }).uz.slice(0, 128),
        price: Number(item.unitPriceTiyin),
        count: item.quantity,
        code: item.mxikCode,
        package_code: item.packageCode,
        vat_percent: Math.round((item.vatRateBp ?? 0) / 100),
        // Sold on behalf of the seller (commission scheme, ADR 0017 — verify with the lawyer).
        ...(item.sellerOrder.store.taxId
          ? { commission_info: { tin: item.sellerOrder.store.taxId } }
          : {}),
      })),
    };
  }

  private async checkPerform(p: Params) {
    const order = await this.prisma.$transaction((tx) => this.validateOrder(tx, p));
    return { allow: true, detail: await this.receiptDetail(order.id) };
  }

  private txView(attempt: {
    id: string;
    createdAt: Date;
    performedAt: Date | null;
    cancelledAt: Date | null;
    providerState: number | null;
    cancelReason: number | null;
  }) {
    return {
      create_time: attempt.createdAt.getTime(),
      perform_time: attempt.performedAt?.getTime() ?? 0,
      cancel_time: attempt.cancelledAt?.getTime() ?? 0,
      transaction: attempt.id,
      state: attempt.providerState ?? PaymeState.CREATED,
      reason: attempt.cancelReason,
    };
  }

  private paymeId(p: Params): string {
    if (typeof p.id !== 'string' || p.id.length === 0 || p.id.length > 100) throw err.request();
    return p.id;
  }

  private expired(createdAt: Date, now = Date.now()): boolean {
    return now - createdAt.getTime() > PAYME_TX_TIMEOUT_MS;
  }

  /** Locks the attempt row (FOR UPDATE) so concurrent duplicate callbacks run one after another. */
  private async lockAttempt(tx: Tx, paymeId: string) {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PaymentAttempt"
      WHERE "method" = 'PAYME' AND "providerTxId" = ${paymeId} FOR UPDATE`;
    return row ? tx.paymentAttempt.findUniqueOrThrow({ where: { id: row.id } }) : null;
  }

  /**
   * Cancels a timed-out created transaction in its own committed transaction,
   * then reports -31008 (an error inside the main transaction would roll the
   * cancellation back).
   */
  private async timeout(attemptId: string): Promise<never> {
    await this.prisma.$transaction((tx) =>
      this.payments.cancelAttempt(tx, attemptId, REASON_TIMEOUT, PaymeState.CANCELLED),
    );
    throw err.cannotPerform();
  }

  private createdView(attempt: { id: string; createdAt: Date; providerState: number | null }) {
    return {
      create_time: attempt.createdAt.getTime(),
      transaction: attempt.id,
      state: attempt.providerState ?? PaymeState.CREATED,
    };
  }

  private async create(p: Params) {
    const paymeId = this.paymeId(p);
    if (!isInt(p.time)) throw err.request();
    const time = p.time;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockAttempt(tx, paymeId);
      if (existing) {
        if (existing.providerState !== PaymeState.CREATED) throw err.cannotPerform();
        if (this.expired(existing.createdAt)) return { timedOut: existing.id };
        return { result: this.createdView(existing) };
      }
      const order = await this.validateOrder(tx, p); // locks the order row
      // A concurrent duplicate may have created it while we waited for the lock.
      const raced = await this.lockAttempt(tx, paymeId);
      if (raced) return { result: this.createdView(raced) };
      // One open Payme transaction per order: a second one could charge twice.
      const open = await tx.paymentAttempt.count({
        where: { orderId: order.id, method: 'PAYME', status: 'PENDING' },
      });
      if (open > 0) throw err.orderNotPayable();
      const attempt = await tx.paymentAttempt.create({
        data: {
          orderId: order.id,
          method: 'PAYME',
          amountTiyin: order.totalTiyin,
          providerTxId: paymeId,
          providerTime: BigInt(time),
          providerState: PaymeState.CREATED,
        },
      });
      return { result: this.createdView(attempt) };
    });
    if (outcome.timedOut !== undefined) return this.timeout(outcome.timedOut);
    return outcome.result;
  }

  private async perform(p: Params) {
    const paymeId = this.paymeId(p);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const attempt = await this.lockAttempt(tx, paymeId);
      if (!attempt) throw err.notFound();
      if (attempt.providerState === PaymeState.CREATED) {
        if (this.expired(attempt.createdAt)) return { timedOut: attempt.id };
        try {
          await this.payments.capture(tx, attempt.id, PaymeState.PERFORMED);
        } catch (e) {
          if (e instanceof AppException) throw err.cannotPerform();
          throw e;
        }
      } else if (attempt.providerState !== PaymeState.PERFORMED) {
        throw err.cannotPerform();
      }
      const done = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      return {
        result: {
          transaction: done.id,
          perform_time: done.performedAt?.getTime() ?? 0,
          state: PaymeState.PERFORMED,
        },
      };
    });
    if (outcome.timedOut !== undefined) return this.timeout(outcome.timedOut);
    return outcome.result;
  }

  private async cancel(p: Params) {
    const paymeId = this.paymeId(p);
    const reason = isInt(p.reason) ? p.reason : null;
    return this.prisma.$transaction(async (tx) => {
      const attempt = await this.lockAttempt(tx, paymeId);
      if (!attempt) throw err.notFound();
      if (attempt.providerState === PaymeState.CREATED) {
        await this.payments.cancelAttempt(tx, attempt.id, reason, PaymeState.CANCELLED);
      } else if (attempt.providerState === PaymeState.PERFORMED) {
        try {
          await this.payments.refundWhole(
            tx,
            attempt.id,
            reason,
            PaymeState.CANCELLED_AFTER_PERFORM,
          );
        } catch (e) {
          if (e instanceof AppException) throw err.cannotCancel();
          throw e;
        }
      }
      const done = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      return {
        transaction: done.id,
        cancel_time: done.cancelledAt?.getTime() ?? 0,
        state: done.providerState,
      };
    });
  }

  private async check(p: Params) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { method_providerTxId: { method: 'PAYME', providerTxId: this.paymeId(p) } },
    });
    if (!attempt) throw err.notFound();
    return this.txView(attempt);
  }

  private async statement(p: Params) {
    if (!isInt(p.from) || !isInt(p.to) || p.from > p.to) throw err.request();
    const rows = await this.prisma.paymentAttempt.findMany({
      where: { method: 'PAYME', providerTime: { gte: BigInt(p.from), lte: BigInt(p.to) } },
      orderBy: { providerTime: 'asc' },
      take: 10_000,
      include: { order: { select: { number: true } } },
    });
    return {
      transactions: rows.map((row) => ({
        id: row.providerTxId,
        time: Number(row.providerTime ?? 0n),
        amount: Number(row.amountTiyin),
        account: { order_id: row.order.number },
        ...this.txView(row),
      })),
    };
  }

  /** Payme reports the fiscal receipt it printed; we keep it in the audit log. */
  private async setFiscalData(p: Params) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { method_providerTxId: { method: 'PAYME', providerTxId: this.paymeId(p) } },
      select: { id: true, orderId: true },
    });
    if (!attempt) throw err.notFound();
    const fiscal = p.fiscal_data as Params | undefined;
    this.logger.log({ attemptId: attempt.id }, 'Payme fiscal data received');
    await this.prisma.auditEvent.create({
      data: {
        action: 'payment.fiscal_data',
        entityType: 'Order',
        entityId: attempt.orderId,
        metadata: {
          attemptId: attempt.id,
          type: typeof p.type === 'string' ? p.type.slice(0, 20) : null,
          receiptId: typeof fiscal?.receipt_id === 'number' ? fiscal.receipt_id : null,
          qrCodeUrl:
            typeof fiscal?.qr_code_url === 'string' ? fiscal.qr_code_url.slice(0, 500) : null,
        },
      },
    });
    return { success: true };
  }
}
