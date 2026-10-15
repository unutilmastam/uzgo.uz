import { z } from 'zod';
import { localizedNameSchema } from './geo.js';
import { tiyinSchema } from './products.js';

const page = z.coerce.number().int().min(1).max(1000).default(1);

/** PUT /api/v1/seller/stores/:storeId/payout-details (owner only). */
export const payoutDetailsSchema = z.strictObject({
  bankName: z.string().trim().min(2).max(100),
  /** Bank code (MFO): 5 digits. */
  mfo: z.string().regex(/^\d{5}$/, 'The bank code has 5 digits'),
  /** Settlement account: 20 digits. */
  account: z.string().regex(/^\d{20}$/, 'The account has 20 digits'),
  recipient: z.string().trim().min(2).max(160),
});
export type PayoutDetails = z.infer<typeof payoutDetailsSchema>;

export const PAYOUT_STATUSES = ['PENDING', 'PAID', 'CANCELLED'] as const;
export const payoutSchema = z.object({
  id: z.uuid(),
  amountTiyin: tiyinSchema,
  status: z.enum(PAYOUT_STATUSES),
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
});

/** Signed amounts from the store's point of view: positive = earned, negative = owed/paid out. */
export const storeLedgerLineSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  amountTiyin: z.string().regex(/^-?\d+$/),
  shipmentNumber: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

/** GET /api/v1/seller/stores/:storeId/finance (owner only). */
export const storeFinanceSchema = z.object({
  /** Earned minus paid out (negative: the store owes commission for cash orders). */
  balanceTiyin: z.string().regex(/^-?\d+$/),
  /** Earnings still inside the return window. */
  heldTiyin: tiyinSchema,
  pendingPayoutsTiyin: tiyinSchema,
  availableTiyin: tiyinSchema,
  holdDays: z.number().int(),
  payoutDetails: payoutDetailsSchema.nullable(),
  lines: z.array(storeLedgerLineSchema),
  payouts: z.array(payoutSchema),
});
export type StoreFinance = z.infer<typeof storeFinanceSchema>;

// ─── Admin ──────────────────────────────────────────────────────────────────

export const REFUND_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;
export const adminRefundListQuerySchema = z.strictObject({
  status: z.enum(REFUND_STATUSES).default('PENDING'),
  page,
});
export const adminRefundSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  shipmentNumber: z.string().nullable(),
  method: z.string(),
  amountTiyin: tiyinSchema,
  status: z.enum(REFUND_STATUSES),
  reason: z.string(),
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
});
export type AdminRefund = z.infer<typeof adminRefundSchema>;
export const adminRefundListResponseSchema = z.object({
  items: z.array(adminRefundSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminRefundList = z.infer<typeof adminRefundListResponseSchema>;

/** POST /admin/refunds/:id/succeed — after returning the money in the provider's cabinet. */
export const refundSucceededSchema = z.strictObject({
  reference: z.string().trim().min(3).max(100),
});
/** POST /admin/refunds/:id/fail */
export const refundFailedSchema = z.strictObject({ note: z.string().trim().min(3).max(300) });

export const adminPayoutSchema = payoutSchema.extend({
  store: z.object({ id: z.uuid(), name: localizedNameSchema }),
  bankSnapshot: payoutDetailsSchema,
});
export type AdminPayout = z.infer<typeof adminPayoutSchema>;
export const adminPayoutListQuerySchema = z.strictObject({
  status: z.enum(PAYOUT_STATUSES).default('PENDING'),
  page,
});
export const adminPayoutListResponseSchema = z.object({
  items: z.array(adminPayoutSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminPayoutList = z.infer<typeof adminPayoutListResponseSchema>;
/** POST /admin/stores/:id/payouts */
export const createPayoutSchema = z.strictObject({ amountTiyin: tiyinSchema });
/** POST /admin/payouts/:id/paid */
export const payoutPaidSchema = z.strictObject({ reference: z.string().trim().min(3).max(100) });

/** PATCH /admin/stores/:id/commission (basis points; null = category rules). */
export const storeCommissionSchema = z.strictObject({
  commissionBp: z.number().int().min(0).max(5000).nullable(),
});

/** GET /admin/ledger — account balances (all journals balance by construction). */
export const ledgerSummarySchema = z.object({
  accounts: z.record(z.string(), z.string().regex(/^-?\d+$/)),
  total: z.string().regex(/^-?\d+$/),
});
export type LedgerSummary = z.infer<typeof ledgerSummarySchema>;

/** GET /admin/stores/:id/finance — same shape as the seller view. */
export { storeFinanceSchema as adminStoreFinanceSchema };
