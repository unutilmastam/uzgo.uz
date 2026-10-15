import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PaymentMethod } from '../generated/prisma/enums.js';
import { transitionInTx } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ONLINE_METHODS } from './payment-methods.js';

type Tx = Prisma.TransactionClient;

/** Orders the payment providers may still collect money for. */
export type PayableOrder = {
  id: string;
  number: string;
  userId: string;
  totalTiyin: bigint;
  paymentMethod: PaymentMethod;
  status: string;
  paymentDueAt: Date | null;
  paidAt: Date | null;
};

const payableSelect = {
  id: true,
  number: true,
  userId: true,
  totalTiyin: true,
  paymentMethod: true,
  status: true,
  paymentDueAt: true,
  paidAt: true,
} as const;

/**
 * Provider-independent payment rules (ADR 0017). Adapters (Payme, Click, dev)
 * translate their protocol into these calls; every state change here is a
 * conditional update inside a transaction, so duplicate or concurrent
 * callbacks cannot pay twice or resurrect a cancelled order.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Locks the order row for the rest of the transaction. */
  async lockOrder(tx: Tx, orderId: string): Promise<PayableOrder | null> {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
    if (!row) return null;
    return tx.order.findUnique({ where: { id: orderId }, select: payableSelect });
  }

  async findOrderByNumber(number: string): Promise<PayableOrder | null> {
    return this.prisma.order.findUnique({ where: { number }, select: payableSelect });
  }

  /** True when the order is online, unpaid and still inside its payment window. */
  isCollectable(order: PayableOrder, method: PaymentMethod, now = new Date()): boolean {
    return (
      order.paymentMethod === method &&
      ONLINE_METHODS.has(method) &&
      order.status === 'AWAITING_PAYMENT' &&
      order.paidAt === null &&
      (order.paymentDueAt === null || order.paymentDueAt > now)
    );
  }

  /**
   * Captures a pending attempt: attempt → PAID, order paid, shipments go to the
   * sellers (PENDING_PAYMENT → NEW). Idempotent: a second call for the same
   * attempt is a no-op; another attempt for an already paid order is refused.
   */
  async capture(tx: Tx, attemptId: string, providerState: number | null = null): Promise<void> {
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (attempt.status === 'PAID') return;
    if (attempt.status !== 'PENDING') {
      throw new AppException(HttpStatus.CONFLICT, 'PAYMENT_NOT_PENDING', 'Payment is not pending');
    }
    const order = await this.lockOrder(tx, attempt.orderId);
    if (!order || order.paidAt !== null || order.status !== 'AWAITING_PAYMENT') {
      throw new AppException(HttpStatus.CONFLICT, 'ORDER_NOT_PAYABLE', 'Order is not payable');
    }
    if (attempt.amountTiyin !== order.totalTiyin) {
      throw new AppException(HttpStatus.CONFLICT, 'AMOUNT_MISMATCH', 'Amount does not match');
    }
    const now = new Date();
    const updated = await tx.paymentAttempt.updateMany({
      where: { id: attemptId, status: 'PENDING' },
      data: { status: 'PAID', performedAt: now, providerState },
    });
    if (updated.count === 0) return;
    await tx.order.update({ where: { id: order.id }, data: { paidAt: now } });
    const shipments = await tx.sellerOrder.findMany({
      where: { orderId: order.id, status: 'PENDING_PAYMENT' },
      orderBy: { number: 'asc' },
      select: { id: true },
    });
    for (const shipment of shipments) {
      await transitionInTx(tx, shipment.id, 'NEW', {
        actor: 'SYSTEM',
        userId: null,
        reason: `paid:${attempt.method}`,
      });
    }
    await this.audit.record(
      {
        action: 'payment.captured',
        entityType: 'Order',
        entityId: order.id,
        metadata: {
          method: attempt.method,
          attemptId,
          amountTiyin: attempt.amountTiyin.toString(),
        },
      },
      tx,
    );
  }

  /** Marks a pending attempt cancelled (the order stays payable by another attempt). */
  async cancelAttempt(
    tx: Tx,
    attemptId: string,
    reason: number | null,
    providerState: number | null,
  ) {
    await tx.paymentAttempt.updateMany({
      where: { id: attemptId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, providerState },
    });
  }

  /**
   * Cancels an unpaid online order: pending attempts cancelled, shipments
   * cancelled, stock returned. No-op for paid or already cancelled orders.
   */
  async cancelUnpaidOrder(
    tx: Tx,
    orderId: string,
    by: { userId: string | null; reason: string },
  ): Promise<boolean> {
    const order = await this.lockOrder(tx, orderId);
    if (!order || order.paidAt !== null || order.status !== 'AWAITING_PAYMENT') return false;
    await tx.paymentAttempt.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    const shipments = await tx.sellerOrder.findMany({
      where: { orderId, status: 'PENDING_PAYMENT' },
      orderBy: { number: 'asc' },
      select: { id: true },
    });
    for (const shipment of shipments) {
      await transitionInTx(tx, shipment.id, 'CANCELLED_BY_CUSTOMER', {
        actor: 'SYSTEM',
        userId: by.userId,
        reason: by.reason,
      });
    }
    await this.audit.record(
      {
        action: 'payment.order_cancelled_unpaid',
        entityType: 'Order',
        entityId: orderId,
        actorId: by.userId,
        metadata: { reason: by.reason },
      },
      tx,
    );
    return true;
  }

  /**
   * Background job: cancels online orders whose payment window has passed.
   * Orders with a provider transaction still pending are left to the provider
   * (Payme keeps a created transaction open up to 12 h and cancels it itself);
   * they are force-expired only after that grace period.
   */
  async expireOverdue(now = new Date(), limit = 100): Promise<number> {
    const graceMs = 12 * 60 * 60 * 1000 + 10 * 60 * 1000;
    const overdue = await this.prisma.order.findMany({
      where: { status: 'AWAITING_PAYMENT', paidAt: null, paymentDueAt: { lt: now } },
      orderBy: { paymentDueAt: 'asc' },
      take: limit,
      select: { id: true, payments: { where: { status: 'PENDING' }, select: { createdAt: true } } },
    });
    let cancelled = 0;
    for (const order of overdue) {
      const pendingRecently = order.payments.some(
        (p) => now.getTime() - p.createdAt.getTime() < graceMs,
      );
      if (pendingRecently) continue;
      try {
        const done = await this.prisma.$transaction((tx) =>
          this.cancelUnpaidOrder(tx, order.id, {
            userId: null,
            reason: 'payment_expired',
          }),
        );
        if (done) cancelled += 1;
      } catch (err) {
        this.logger.error({ err, orderId: order.id }, 'Failed to expire an unpaid order');
      }
    }
    return cancelled;
  }

  /** The payment window in minutes (for UI and providers' expiry hints). */
  get windowMinutes(): number {
    return this.env.PAYMENT_WINDOW_MINUTES;
  }
}
