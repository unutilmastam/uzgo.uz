import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import type { LedgerAccount, SellerOrderStatus } from '../generated/prisma/enums.js';

type Tx = Prisma.TransactionClient;

export type Posting = {
  account: LedgerAccount;
  /** Positive = debit, negative = credit (tiyin). */
  amountTiyin: bigint;
  storeId?: string | null;
  /** COURIER_PAYABLE lines name the courier. */
  courierId?: string | null;
  /** DRIVER_PAYABLE lines name the driver. */
  driverId?: string | null;
};

export type JournalRefs = {
  kind: string;
  orderId?: string | null;
  sellerOrderId?: string | null;
  refundId?: string | null;
  payoutId?: string | null;
};

/**
 * Writes one balanced journal (ADR 0018). Zero lines are skipped; an
 * unbalanced journal throws here and is also rejected by the database at
 * commit (deferred constraint trigger).
 */
export async function postJournal(tx: Tx, postings: Posting[], refs: JournalRefs): Promise<void> {
  const lines = postings.filter((p) => p.amountTiyin !== 0n);
  if (lines.length === 0) return;
  const total = lines.reduce((sum, p) => sum + p.amountTiyin, 0n);
  if (total !== 0n) throw new Error(`Unbalanced journal (${refs.kind}): ${total.toString()}`);
  const journalId = randomUUID();
  await tx.ledgerEntry.createMany({
    data: lines.map((p) => ({
      journalId,
      account: p.account,
      storeId: p.storeId ?? null,
      courierId: p.courierId ?? null,
      driverId: p.driverId ?? null,
      amountTiyin: p.amountTiyin,
      kind: refs.kind,
      orderId: refs.orderId ?? null,
      sellerOrderId: refs.sellerOrderId ?? null,
      refundId: refs.refundId ?? null,
      payoutId: refs.payoutId ?? null,
    })),
  });
}

/** Commission of one line: floor(line × bp / 10 000) — rounding favours the seller. */
export function lineCommission(lineTotalTiyin: bigint, commissionBp: number): bigint {
  return (lineTotalTiyin * BigInt(commissionBp)) / 10_000n;
}

/** Store override → nearest category with a rate → default. */
export function resolveCommissionBp(
  storeBp: number | null,
  categoryId: string,
  categories: Map<string, { parentId: string | null; commissionBp: number | null }>,
  defaultBp: number,
): number {
  if (storeBp !== null) return storeBp;
  let current = categories.get(categoryId);
  for (let depth = 0; current && depth < 10; depth += 1) {
    if (current.commissionBp !== null) return current.commissionBp;
    current = current.parentId ? categories.get(current.parentId) : undefined;
  }
  return defaultBp;
}

/** Customer captured an online payment: the money is held for undelivered goods. */
export function capturePostings(orderTotal: bigint): Posting[] {
  return [
    { account: 'PROVIDER_CLEARING', amountTiyin: orderTotal },
    { account: 'CUSTOMER_PREPAYMENTS', amountTiyin: -orderTotal },
  ];
}

export async function refundPostings(
  tx: Tx,
  refund: { id: string; orderId: string; sellerOrderId: string | null; amountTiyin: bigint },
) {
  await postJournal(
    tx,
    [
      { account: 'CUSTOMER_PREPAYMENTS', amountTiyin: refund.amountTiyin },
      { account: 'PROVIDER_CLEARING', amountTiyin: -refund.amountTiyin },
    ],
    {
      kind: 'refund',
      orderId: refund.orderId,
      sellerOrderId: refund.sellerOrderId,
      refundId: refund.id,
    },
  );
}

const REFUND_REASON: Partial<Record<SellerOrderStatus, string>> = {
  CANCELLED_BY_SELLER: 'shipment_cancelled',
  CANCELLED_BY_CUSTOMER: 'shipment_cancelled',
  DELIVERY_FAILED: 'delivery_failed',
  RETURNED: 'returned',
};

/**
 * Money side of a shipment status change (called inside the transition's
 * transaction). `total` is the shipment at full price, `discount` its share of
 * a UZGO promo (ADR 0023): the customer paid total − discount, the seller is
 * still owed total − commission, and UZGO books the discount as an expense.
 * - DELIVERED, paid online: prepayment + promo expense → seller payable + UZGO
 *   commission; cash on delivery (the seller collected total − discount): the
 *   seller owes the commission and is owed the discount.
 * - RETURNED: the delivery entry is reversed.
 * - Cancelled / failed / returned after an online payment: a PENDING refund
 *   of what the customer paid for the shipment (DEV_ONLINE refunds complete at
 *   once), unless the provider already returned the whole payment.
 */
export async function onShipmentTransition(
  tx: Tx,
  sellerOrderId: string,
  to: SellerOrderStatus,
  options: { providerRefunded?: boolean } = {},
): Promise<void> {
  const shipment = await tx.sellerOrder.findUniqueOrThrow({
    where: { id: sellerOrderId },
    select: {
      id: true,
      orderId: true,
      storeId: true,
      totalTiyin: true,
      discountTiyin: true,
      commissionTiyin: true,
      courierId: true,
      courierFeeTiyin: true,
      order: { select: { paymentMethod: true, paidAt: true, kind: true, foodDeliveryMode: true } },
    },
  });
  const paidOnline =
    shipment.order.paymentMethod !== 'CASH_ON_DELIVERY' && shipment.order.paidAt !== null;
  const cod = shipment.order.paymentMethod === 'CASH_ON_DELIVERY';
  const total = shipment.totalTiyin;
  const discount = shipment.discountTiyin;
  const paid = total - discount;
  const commission = shipment.commissionTiyin;
  const refs = { orderId: shipment.orderId, sellerOrderId: shipment.id };
  // Food with a UZGO courier (ADR 0024): the fee is not in the restaurant's
  // total; the customer paid it on top and the courier earns it.
  const uzgoCourier = shipment.order.kind === 'FOOD' && shipment.order.foodDeliveryMode === 'UZGO';
  const fee = uzgoCourier ? shipment.courierFeeTiyin : 0n;

  if (to === 'DELIVERED' && uzgoCourier) {
    const courierId = shipment.courierId;
    if (!courierId) throw new Error('Food delivery without a courier');
    if (paidOnline) {
      await postJournal(
        tx,
        [
          { account: 'CUSTOMER_PREPAYMENTS', amountTiyin: paid + fee },
          { account: 'PLATFORM_PROMOTIONS', amountTiyin: discount },
          {
            account: 'SELLER_PAYABLE',
            amountTiyin: -(total - commission),
            storeId: shipment.storeId,
          },
          { account: 'PLATFORM_REVENUE', amountTiyin: -commission },
          { account: 'COURIER_PAYABLE', amountTiyin: -fee, courierId },
        ],
        { kind: 'food_delivered', ...refs },
      );
    } else if (cod) {
      // The courier collected paid + fee in cash and keeps the fee: they owe UZGO `paid`.
      await postJournal(
        tx,
        [
          { account: 'COURIER_PAYABLE', amountTiyin: paid, courierId },
          { account: 'PLATFORM_PROMOTIONS', amountTiyin: discount },
          {
            account: 'SELLER_PAYABLE',
            amountTiyin: -(total - commission),
            storeId: shipment.storeId,
          },
          { account: 'PLATFORM_REVENUE', amountTiyin: -commission },
        ],
        { kind: 'food_cash_delivered', ...refs },
      );
    }
  } else if (to === 'DELIVERED') {
    if (paidOnline) {
      await postJournal(
        tx,
        [
          { account: 'CUSTOMER_PREPAYMENTS', amountTiyin: paid },
          { account: 'PLATFORM_PROMOTIONS', amountTiyin: discount },
          {
            account: 'SELLER_PAYABLE',
            amountTiyin: -(total - commission),
            storeId: shipment.storeId,
          },
          { account: 'PLATFORM_REVENUE', amountTiyin: -commission },
        ],
        { kind: 'shipment_delivered', ...refs },
      );
    } else if (cod) {
      await postJournal(
        tx,
        [
          {
            account: 'SELLER_PAYABLE',
            amountTiyin: commission - discount,
            storeId: shipment.storeId,
          },
          { account: 'PLATFORM_PROMOTIONS', amountTiyin: discount },
          { account: 'PLATFORM_REVENUE', amountTiyin: -commission },
        ],
        { kind: 'cod_commission', ...refs },
      );
    }
  }

  if (to === 'RETURNED') {
    if (paidOnline) {
      await postJournal(
        tx,
        [
          { account: 'SELLER_PAYABLE', amountTiyin: total - commission, storeId: shipment.storeId },
          { account: 'PLATFORM_REVENUE', amountTiyin: commission },
          { account: 'PLATFORM_PROMOTIONS', amountTiyin: -discount },
          { account: 'CUSTOMER_PREPAYMENTS', amountTiyin: -paid },
        ],
        { kind: 'return_reversal', ...refs },
      );
    } else if (cod) {
      // The seller returns the cash; UZGO gives the commission back and takes the discount back.
      await postJournal(
        tx,
        [
          { account: 'PLATFORM_REVENUE', amountTiyin: commission },
          { account: 'PLATFORM_PROMOTIONS', amountTiyin: -discount },
          {
            account: 'SELLER_PAYABLE',
            amountTiyin: -(commission - discount),
            storeId: shipment.storeId,
          },
        ],
        { kind: 'return_reversal', ...refs },
      );
    }
  }

  const reason = REFUND_REASON[to];
  if (reason && paidOnline && !options.providerRefunded) {
    const payment = await tx.paymentAttempt.findFirstOrThrow({
      where: { orderId: shipment.orderId, status: 'PAID' },
      select: { id: true, method: true },
    });
    const refund = await tx.refund.create({
      data: {
        orderId: shipment.orderId,
        sellerOrderId: shipment.id,
        paymentAttemptId: payment.id,
        amountTiyin: paid + fee,
        reason,
      },
    });
    // The simulated provider "returns" money instantly (development/tests only).
    if (payment.method === 'DEV_ONLINE') {
      await tx.refund.update({
        where: { id: refund.id },
        data: { status: 'SUCCEEDED', reference: 'dev', processedAt: new Date() },
      });
      await refundPostings(tx, refund);
    }
  }
}
