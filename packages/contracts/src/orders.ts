import { z } from 'zod';
import { phoneInputSchema } from './auth.js';
import { localizedNameSchema } from './geo.js';
import { storeRefSchema, tiyinSchema } from './products.js';

export const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'CREATED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
] as const;
export const SELLER_ORDER_STATUSES = [
  'PENDING_PAYMENT',
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

/** `DEV_ONLINE` exists only in development and tests (simulated payment). */
export const PAYMENT_METHODS = ['CASH_ON_DELIVERY', 'PAYME', 'CLICK', 'DEV_ONLINE'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const ONLINE_PAYMENT_METHODS = ['PAYME', 'CLICK', 'DEV_ONLINE'] as const;

/** GET /api/v1/payments/methods — what checkout can offer right now. */
export const paymentMethodsResponseSchema = z.object({ items: z.array(paymentMethodSchema) });

export const paymentStatusSchema = z.enum([
  'NOT_REQUIRED',
  'UNPAID',
  'PAID',
  'EXPIRED',
  'REFUNDED',
]);
export type PaymentState = z.infer<typeof paymentStatusSchema>;
export const sellerOrderStatusSchema = z.enum(SELLER_ORDER_STATUSES);
export type SellerOrderStatus = z.infer<typeof sellerOrderStatusSchema>;

/** POST /api/v1/checkout (requires an Idempotency-Key header). Prices never come from the client. */
export const DELIVERY_TYPES = ['COURIER', 'PICKUP'] as const;
export const deliveryTypeSchema = z.enum(DELIVERY_TYPES);
export type DeliveryType = z.infer<typeof deliveryTypeSchema>;

export const checkoutSchema = z
  .strictObject({
    recipientName: z.string().trim().min(2).max(100),
    recipientPhone: phoneInputSchema,
    districtId: z.uuid(),
    deliveryType: deliveryTypeSchema.default('COURIER'),
    /** Required for courier delivery. */
    addressLine: z.string().trim().min(5).max(200).optional(),
    /** Required for pickup; must be in `districtId`. */
    pickupPointId: z.uuid().optional(),
    comment: z.string().trim().max(500).optional(),
    paymentMethod: paymentMethodSchema,
    /** The total the customer saw (items + delivery); a different server total returns PRICE_CHANGED. */
    expectedTotalTiyin: tiyinSchema,
  })
  .refine((v) => v.deliveryType !== 'COURIER' || v.addressLine !== undefined, {
    message: 'Address required',
    path: ['addressLine'],
  })
  .refine((v) => v.deliveryType !== 'PICKUP' || v.pickupPointId !== undefined, {
    message: 'Pickup point required',
    path: ['pickupPointId'],
  });
export type CheckoutInput = z.output<typeof checkoutSchema>;
export type CheckoutRequest = z.input<typeof checkoutSchema>;

/** GET /api/v1/delivery/quote?districtId=&type=&pickupPointId= — for the caller's cart. */
export const deliveryQuoteQuerySchema = z.strictObject({
  districtId: z.uuid(),
  type: deliveryTypeSchema.default('COURIER'),
  pickupPointId: z.uuid().optional(),
});
export const deliveryQuoteSchema = z.object({
  available: z.boolean(),
  /** null: no tariff for this district yet — the seller agrees the price. */
  etaDays: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  shipments: z.array(
    z.object({ storeId: z.uuid(), itemsTotalTiyin: tiyinSchema, deliveryTiyin: tiyinSchema }),
  ),
  itemsTotalTiyin: tiyinSchema,
  deliveryTotalTiyin: tiyinSchema,
  totalTiyin: tiyinSchema,
});
export type DeliveryQuote = z.infer<typeof deliveryQuoteSchema>;

export const pickupPointSchema = z.object({
  id: z.uuid(),
  districtId: z.uuid(),
  name: localizedNameSchema,
  address: z.string(),
  hours: z.string().nullable(),
  phone: z.string().nullable(),
});
export type PickupPoint = z.infer<typeof pickupPointSchema>;
/** GET /api/v1/delivery/pickup-points?districtId= */
export const pickupPointsResponseSchema = z.object({ items: z.array(pickupPointSchema) });

/** PATCH /api/v1/seller/seller-orders/:id/tracking */
export const trackingSchema = z.strictObject({
  carrier: z.string().trim().min(2).max(60),
  trackingCode: z.string().trim().min(3).max(60),
});

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
  tracking: z.object({ carrier: z.string(), code: z.string() }).nullable(),
  /** Status history, oldest first. */
  timeline: z.array(z.object({ status: sellerOrderStatusSchema, at: z.string() })),
});
export type SellerOrderView = z.infer<typeof sellerOrderViewSchema>;

export const orderViewSchema = z.object({
  number: z.string(),
  status: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  /** Online orders only; cash on delivery is NOT_REQUIRED. */
  payment: z.object({
    status: paymentStatusSchema,
    dueAt: z.string().nullable(),
    paidAt: z.string().nullable(),
  }),
  createdAt: z.string(),
  itemsTotalTiyin: tiyinSchema,
  deliveryTotalTiyin: tiyinSchema,
  totalTiyin: tiyinSchema,
  deliveryType: deliveryTypeSchema,
  pickupPoint: z
    .object({ name: localizedNameSchema, address: z.string(), hours: z.string().nullable() })
    .nullable(),
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
