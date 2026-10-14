import { z } from 'zod';
import { phoneInputSchema } from './auth.js';
import { localizedNameSchema } from './geo.js';
import { storeRefSchema, tiyinSchema } from './products.js';

export const ORDER_STATUSES = ['CREATED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
export const SELLER_ORDER_STATUSES = [
  'NEW',
  'ACCEPTED',
  'PACKED',
  'HANDED_TO_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'CANCELLED_BY_SELLER',
  'CANCELLED_BY_CUSTOMER',
  'RETURN_REQUESTED',
  'RETURNED',
  'RETURN_REJECTED',
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const sellerOrderStatusSchema = z.enum(SELLER_ORDER_STATUSES);
export type SellerOrderStatus = z.infer<typeof sellerOrderStatusSchema>;

/** POST /api/v1/checkout (requires an Idempotency-Key header). Prices never come from the client. */
export const checkoutSchema = z.strictObject({
  recipientName: z.string().trim().min(2).max(100),
  recipientPhone: phoneInputSchema,
  districtId: z.uuid(),
  addressLine: z.string().trim().min(5).max(200),
  comment: z.string().trim().max(500).optional(),
  paymentMethod: z.literal('CASH_ON_DELIVERY'),
  /** The total the customer saw; a different server total returns PRICE_CHANGED. */
  expectedTotalTiyin: tiyinSchema,
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const idempotencyKeySchema = z.uuid();

const orderItemSchema = z.object({
  productSlug: z.string(),
  title: localizedNameSchema,
  options: z.array(localizedNameSchema),
  sku: z.string(),
  unitPriceTiyin: tiyinSchema,
  quantity: z.number().int().positive(),
  lineTotalTiyin: tiyinSchema,
});

export const sellerOrderViewSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: sellerOrderStatusSchema,
  store: storeRefSchema,
  items: z.array(orderItemSchema),
  itemsTotalTiyin: tiyinSchema,
  deliveryTiyin: tiyinSchema,
  totalTiyin: tiyinSchema,
  /** Statuses the current viewer may move this shipment to. */
  allowedTransitions: z.array(sellerOrderStatusSchema),
});
export type SellerOrderView = z.infer<typeof sellerOrderViewSchema>;

export const orderViewSchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  paymentMethod: z.literal('CASH_ON_DELIVERY'),
  createdAt: z.string(),
  itemsTotalTiyin: tiyinSchema,
  deliveryTotalTiyin: tiyinSchema,
  totalTiyin: tiyinSchema,
  address: z.object({
    recipientName: z.string(),
    recipientPhone: z.string(),
    region: localizedNameSchema,
    district: localizedNameSchema,
    line: z.string(),
    comment: z.string().nullable(),
  }),
  sellerOrders: z.array(sellerOrderViewSchema),
});
export type OrderView = z.infer<typeof orderViewSchema>;

export const orderResponseSchema = z.object({ order: orderViewSchema });

export const orderSummarySchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  createdAt: z.string(),
  totalTiyin: tiyinSchema,
  itemCount: z.number().int(),
  storeCount: z.number().int(),
});
export const orderListResponseSchema = z.object({ items: z.array(orderSummarySchema) });

/** POST …/transition */
export const transitionSchema = z.strictObject({
  to: sellerOrderStatusSchema,
  reason: z.string().trim().max(300).optional(),
});

/** Seller view of a shipment (GET /api/v1/seller/orders). */
export const sellerShipmentSchema = sellerOrderViewSchema.extend({
  orderNumber: z.string(),
  createdAt: z.string(),
  recipientName: z.string(),
  recipientPhone: z.string(),
  district: localizedNameSchema,
  addressLine: z.string(),
});
export const sellerShipmentListSchema = z.object({ items: z.array(sellerShipmentSchema) });
