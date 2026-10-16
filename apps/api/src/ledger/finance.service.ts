import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AdminPayout,
  AdminPayoutList,
  AdminRefundList,
  LedgerSummary,
  PayoutDetails,
  StoreFinance,
} from '@uzgo/contracts';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { PayoutStatus, RefundStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { postJournal, refundPostings } from './ledger.js';

const PAGE_SIZE = 20;
type Meta = { ip: string; requestId?: string | undefined };
type Names = { uz: string; ru: string };

const conflict = (code: string, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);
const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);

/** Store balances, refunds handled by staff, and payouts (ADR 0018). */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Sum of SELLER_PAYABLE entries as the store sees it (credit = positive). */
  private async storeBalance(tx: Prisma.TransactionClient, storeId: string) {
    const holdSince = new Date(Date.now() - this.env.PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000);
    const [all, held, pending] = await Promise.all([
      tx.ledgerEntry.aggregate({
        where: { account: 'SELLER_PAYABLE', storeId },
        _sum: { amountTiyin: true },
      }),
      tx.ledgerEntry.aggregate({
        where: {
          account: 'SELLER_PAYABLE',
          storeId,
          kind: 'shipment_delivered',
          createdAt: { gt: holdSince },
        },
        _sum: { amountTiyin: true },
      }),
      tx.payout.aggregate({
        where: { storeId, status: 'PENDING' },
        _sum: { amountTiyin: true },
      }),
    ]);
    const balance = -(all._sum.amountTiyin ?? 0n);
    const heldRaw = -(held._sum.amountTiyin ?? 0n);
    const heldAmount = heldRaw > 0n ? heldRaw : 0n;
    const pendingPayouts = pending._sum.amountTiyin ?? 0n;
    const available = balance - heldAmount - pendingPayouts;
    return {
      balance,
      held: heldAmount,
      pendingPayouts,
      available: available > 0n ? available : 0n,
    };
  }

  async storeFinance(storeId: string): Promise<StoreFinance> {
    const [store, sums, lines, payouts] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: {
          payoutBankName: true,
          payoutMfo: true,
          payoutAccount: true,
          payoutRecipient: true,
        },
      }),
      this.storeBalance(this.prisma, storeId),
      this.prisma.ledgerEntry.findMany({
        where: { account: 'SELLER_PAYABLE', storeId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, kind: true, amountTiyin: true, sellerOrderId: true, createdAt: true },
      }),
      this.prisma.payout.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const shipmentIds = lines.flatMap((l) => (l.sellerOrderId ? [l.sellerOrderId] : []));
    const shipments = await this.prisma.sellerOrder.findMany({
      where: { id: { in: shipmentIds } },
      select: { id: true, number: true },
    });
    const numberOf = new Map(shipments.map((s) => [s.id, s.number]));
    return {
      balanceTiyin: sums.balance.toString(),
      heldTiyin: sums.held.toString(),
      pendingPayoutsTiyin: sums.pendingPayouts.toString(),
      availableTiyin: sums.available.toString(),
      holdDays: this.env.PAYOUT_HOLD_DAYS,
      payoutDetails:
        store.payoutBankName && store.payoutMfo && store.payoutAccount && store.payoutRecipient
          ? {
              bankName: store.payoutBankName,
              mfo: store.payoutMfo,
              account: store.payoutAccount,
              recipient: store.payoutRecipient,
            }
          : null,
      lines: lines.map((l) => ({
        id: l.id,
        kind: l.kind,
        amountTiyin: (-l.amountTiyin).toString(),
        shipmentNumber: l.sellerOrderId ? (numberOf.get(l.sellerOrderId) ?? null) : null,
        createdAt: l.createdAt.toISOString(),
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        amountTiyin: p.amountTiyin.toString(),
        status: p.status,
        reference: p.reference,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    };
  }

  async setPayoutDetails(storeId: string, actorId: string, details: PayoutDetails, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: storeId },
        data: {
          payoutBankName: details.bankName,
          payoutMfo: details.mfo,
          payoutAccount: details.account,
          payoutRecipient: details.recipient,
        },
      });
      await this.audit.record(
        {
          action: 'store.payout_details_changed',
          entityType: 'Store',
          entityId: storeId,
          actorId,
          // Only the last digits: enough to recognise, useless to misuse.
          metadata: { mfo: details.mfo, accountLast4: details.account.slice(-4) },
          ...meta,
        },
        tx,
      );
    });
  }

  // ─── Refunds (staff) ──────────────────────────────────────────────────────

  async listRefunds(status: RefundStatus, page: number): Promise<AdminRefundList> {
    const where = { status } satisfies Prisma.RefundWhereInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.refund.count({ where }),
      this.prisma.refund.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          order: { select: { number: true } },
          sellerOrder: { select: { number: true } },
          paymentAttempt: { select: { method: true } },
        },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        orderNumber: r.order.number,
        shipmentNumber: r.sellerOrder?.number ?? null,
        method: r.paymentAttempt.method,
        amountTiyin: r.amountTiyin.toString(),
        status: r.status,
        reason: r.reason,
        reference: r.reference,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Staff returned the money in the provider's cabinet: record it and post the ledger. */
  async markRefund(
    id: string,
    outcome: { status: 'SUCCEEDED'; reference: string } | { status: 'FAILED'; note: string },
    actorId: string,
    meta: Meta,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: RefundStatus }[]>`
        SELECT "status" FROM "Refund" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!row) throw notFound('Refund');
      const allowed: RefundStatus[] =
        outcome.status === 'SUCCEEDED' ? ['PENDING', 'FAILED'] : ['PENDING'];
      if (!allowed.includes(row.status)) {
        throw conflict('INVALID_TRANSITION', `Refund is ${row.status}`);
      }
      const refund = await tx.refund.update({
        where: { id },
        data: {
          status: outcome.status,
          reference: outcome.status === 'SUCCEEDED' ? outcome.reference : outcome.note,
          processedById: actorId,
          processedAt: new Date(),
        },
      });
      if (outcome.status === 'SUCCEEDED') await refundPostings(tx, refund);
      await this.audit.record(
        {
          action: outcome.status === 'SUCCEEDED' ? 'refund.succeeded' : 'refund.failed',
          entityType: 'Refund',
          entityId: id,
          actorId,
          metadata: { amountTiyin: refund.amountTiyin.toString(), orderId: refund.orderId },
          ...meta,
        },
        tx,
      );
    });
  }

  // ─── Payouts (staff) ──────────────────────────────────────────────────────

  private toAdminPayout(
    p: Prisma.PayoutGetPayload<{ include: { store: { select: { id: true; name: true } } } }>,
  ): AdminPayout {
    return {
      id: p.id,
      amountTiyin: p.amountTiyin.toString(),
      status: p.status,
      reference: p.reference,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
      store: { id: p.store.id, name: p.store.name as Names },
      bankSnapshot: p.bankSnapshot as PayoutDetails,
    };
  }

  async listPayouts(status: PayoutStatus, page: number): Promise<AdminPayoutList> {
    const where = { status } satisfies Prisma.PayoutWhereInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payout.count({ where }),
      this.prisma.payout.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { store: { select: { id: true, name: true } } },
      }),
    ]);
    return { items: rows.map((p) => this.toAdminPayout(p)), total, page, pageSize: PAGE_SIZE };
  }

  /** Schedules a payout of at most the store's available balance. */
  async createPayout(
    storeId: string,
    amount: bigint,
    actorId: string,
    meta: Meta,
  ): Promise<AdminPayout> {
    const payout = await this.prisma.$transaction(async (tx) => {
      // Serialise payouts per store so two staff members cannot both pay the same balance.
      await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${storeId}::uuid FOR UPDATE`;
      const store = await tx.store.findUnique({
        where: { id: storeId },
        select: {
          payoutBankName: true,
          payoutMfo: true,
          payoutAccount: true,
          payoutRecipient: true,
        },
      });
      if (!store) throw notFound('Store');
      if (
        !store.payoutBankName ||
        !store.payoutMfo ||
        !store.payoutAccount ||
        !store.payoutRecipient
      ) {
        throw conflict('PAYOUT_DETAILS_MISSING', 'The store has no bank details');
      }
      const { available } = await this.storeBalance(tx, storeId);
      if (amount <= 0n || amount > available) {
        throw conflict('PAYOUT_EXCEEDS_BALANCE', 'Amount exceeds the available balance');
      }
      const created = await tx.payout.create({
        data: {
          storeId,
          amountTiyin: amount,
          createdById: actorId,
          bankSnapshot: {
            bankName: store.payoutBankName,
            mfo: store.payoutMfo,
            account: store.payoutAccount,
            recipient: store.payoutRecipient,
          },
        },
        include: { store: { select: { id: true, name: true } } },
      });
      await this.audit.record(
        {
          action: 'payout.created',
          entityType: 'Payout',
          entityId: created.id,
          actorId,
          metadata: { storeId, amountTiyin: amount.toString() },
          ...meta,
        },
        tx,
      );
      return created;
    });
    return this.toAdminPayout(payout);
  }

  /** The bank transfer was made: PENDING → PAID, ledger posted. Other transitions: PENDING → CANCELLED. */
  async settlePayout(
    id: string,
    outcome: { status: 'PAID'; reference: string } | { status: 'CANCELLED' },
    actorId: string,
    meta: Meta,
  ): Promise<AdminPayout> {
    const payout = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: PayoutStatus }[]>`
        SELECT "status" FROM "Payout" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!row) throw notFound('Payout');
      if (row.status !== 'PENDING') throw conflict('INVALID_TRANSITION', `Payout is ${row.status}`);
      const updated = await tx.payout.update({
        where: { id },
        data:
          outcome.status === 'PAID'
            ? {
                status: 'PAID',
                reference: outcome.reference,
                paidById: actorId,
                paidAt: new Date(),
              }
            : { status: 'CANCELLED' },
        include: { store: { select: { id: true, name: true } } },
      });
      if (outcome.status === 'PAID') {
        await postJournal(
          tx,
          [
            {
              account: 'SELLER_PAYABLE',
              amountTiyin: updated.amountTiyin,
              storeId: updated.storeId,
            },
            { account: 'PROVIDER_CLEARING', amountTiyin: -updated.amountTiyin },
          ],
          { kind: 'payout', payoutId: updated.id },
        );
      }
      await this.audit.record(
        {
          action: outcome.status === 'PAID' ? 'payout.paid' : 'payout.cancelled',
          entityType: 'Payout',
          entityId: id,
          actorId,
          metadata: { storeId: updated.storeId, amountTiyin: updated.amountTiyin.toString() },
          ...meta,
        },
        tx,
      );
      return updated;
    });
    return this.toAdminPayout(payout);
  }

  async ledgerSummary(): Promise<LedgerSummary> {
    const groups = await this.prisma.ledgerEntry.groupBy({
      by: ['account'],
      _sum: { amountTiyin: true },
    });
    const accounts: Record<string, string> = {
      PROVIDER_CLEARING: '0',
      CUSTOMER_PREPAYMENTS: '0',
      SELLER_PAYABLE: '0',
      PLATFORM_REVENUE: '0',
      PLATFORM_PROMOTIONS: '0',
      COURIER_PAYABLE: '0',
      DRIVER_PAYABLE: '0',
    };
    let total = 0n;
    for (const g of groups) {
      const sum = g._sum.amountTiyin ?? 0n;
      accounts[g.account] = sum.toString();
      total += sum;
    }
    return { accounts, total: total.toString() };
  }

  async setStoreCommission(storeId: string, bp: number | null, actorId: string, meta: Meta) {
    const updated = await this.prisma.store.updateMany({
      where: { id: storeId, deletedAt: null },
      data: { commissionBp: bp },
    });
    if (updated.count === 0) throw notFound('Store');
    await this.audit.record({
      action: 'store.commission_changed',
      entityType: 'Store',
      entityId: storeId,
      actorId,
      metadata: { commissionBp: bp },
      ...meta,
    });
  }
}
