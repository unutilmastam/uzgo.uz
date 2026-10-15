import { z } from 'zod';
import { localizedNameSchema } from './geo.js';
import { paymentMethodSchema, sellerOrderStatusSchema } from './orders.js';
import { courierVehicleSchema, foodDeliveryModeSchema } from './food-order.js';
import { tiyinSchema } from './products.js';
import { slugSchema } from './stores.js';

// ─── UZGO Food (Phase 9b, ADR 0024) ─────────────────────────────────────────

export * from './food-order.js';

/** WGS 84 coordinates; Uzbekistan's bounding box for anything we deliver to. */
export const latSchema = z.number().min(37).max(46);
export const lngSchema = z.number().min(55).max(74);
export const pointSchema = z.strictObject({ lat: latSchema, lng: lngSchema });
export type GeoPoint = z.infer<typeof pointSchema>;
/** Query-string variant (?lat=&lng=). */
const queryLat = z.coerce.number().min(37).max(46);
const queryLng = z.coerce.number().min(55).max(74);

const shortText = (max: number) => z.string().trim().min(1).max(max);
const names = (max: number) => z.strictObject({ uz: shortText(max), ru: shortText(max) });
const positiveTiyin = tiyinSchema.refine((v) => BigInt(v) > 0n, 'Must be positive');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** Weekly hours in Tashkent time; Monday = 0. "00:00–00:00" = open all day. */
export const openingHoursSchema = z
  .array(z.strictObject({ day: z.number().int().min(0).max(6), open: time, close: time }))
  .max(14);
export type OpeningHours = z.infer<typeof openingHoursSchema>;

const phone = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^[+\d\s()-]+$/);

// ─── Staff: restaurants and menus ────────────────────────────────────────────

/** POST /api/v1/admin/restaurants — staff add restaurants (no self-service). */
export const createRestaurantSchema = z.strictObject({
  name: names(80),
  slug: slugSchema,
  description: names(500).optional(),
  /** Phone of an existing UZGO account: becomes the restaurant's owner. */
  ownerPhone: phone,
  districtId: z.uuid(),
  address: shortText(200),
  lat: latSchema,
  lng: lngSchema,
  phone: phone.optional(),
  deliveryMode: foodDeliveryModeSchema,
  deliveryRadiusM: z.number().int().min(500).max(30_000).default(5000),
  selfDeliveryFeeTiyin: tiyinSchema.default('0'),
  minOrderTiyin: tiyinSchema.default('0'),
  prepMinutes: z.number().int().min(5).max(180).default(25),
  openingHours: openingHoursSchema.min(1),
  commissionBp: z.number().int().min(0).max(5000).optional(),
  legalName: shortText(160).optional(),
  taxId: z
    .string()
    .regex(/^\d{9}$/)
    .optional(),
});
export type CreateRestaurant = z.output<typeof createRestaurantSchema>;

/** PATCH /api/v1/admin/restaurants/:id */
export const updateRestaurantSchema = z
  .strictObject({
    name: names(80),
    description: names(500).nullable(),
    districtId: z.uuid(),
    address: shortText(200),
    lat: latSchema,
    lng: lngSchema,
    phone: phone.nullable(),
    deliveryMode: foodDeliveryModeSchema,
    deliveryRadiusM: z.number().int().min(500).max(30_000),
    selfDeliveryFeeTiyin: tiyinSchema,
    minOrderTiyin: tiyinSchema,
    prepMinutes: z.number().int().min(5).max(180),
    openingHours: openingHoursSchema.min(1),
    commissionBp: z.number().int().min(0).max(5000).nullable(),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateRestaurant = z.output<typeof updateRestaurantSchema>;

export const menuCategoryInputSchema = z.strictObject({
  name: names(60),
  sort: z.number().int().min(0).max(10_000).default(0),
});
export type MenuCategoryInput = z.output<typeof menuCategoryInputSchema>;

export const menuItemInputSchema = z.strictObject({
  categoryId: z.uuid(),
  name: names(100),
  description: names(500).nullable().optional(),
  priceTiyin: positiveTiyin,
  sort: z.number().int().min(0).max(10_000).default(0),
  /** IKPU (MXIK, 17 digits) and package code: needed for online payment receipts. */
  mxikCode: z
    .string()
    .regex(/^\d{17}$/)
    .nullable()
    .optional(),
  packageCode: z
    .string()
    .regex(/^\d{1,20}$/)
    .nullable()
    .optional(),
  vatRateBp: z.number().int().min(0).max(10_000).nullable().optional(),
});
export type MenuItemInput = z.output<typeof menuItemInputSchema>;
export const updateMenuItemSchema = menuItemInputSchema
  .partial()
  .extend({ archived: z.boolean().optional(), available: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMenuItem = z.output<typeof updateMenuItemSchema>;

export const menuItemSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: localizedNameSchema,
  description: localizedNameSchema.nullable(),
  priceTiyin: tiyinSchema,
  image: z.string().nullable(),
  available: z.boolean(),
  sort: z.number().int(),
});
export type MenuItem = z.infer<typeof menuItemSchema>;
export const menuCategorySchema = z.object({
  id: z.uuid(),
  name: localizedNameSchema,
  sort: z.number().int(),
  items: z.array(menuItemSchema),
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;

/** Staff and restaurant team view (adds fiscal fields and archived dishes). */
export const adminMenuItemSchema = menuItemSchema.extend({
  archived: z.boolean(),
  mxikCode: z.string().nullable(),
  packageCode: z.string().nullable(),
  vatRateBp: z.number().int().nullable(),
});
export const adminMenuCategorySchema = menuCategorySchema.extend({
  items: z.array(adminMenuItemSchema),
});

export const adminRestaurantSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: localizedNameSchema,
  description: localizedNameSchema.nullable(),
  status: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']),
  districtId: z.uuid().nullable(),
  district: localizedNameSchema.nullable(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  phone: z.string().nullable(),
  deliveryMode: foodDeliveryModeSchema,
  deliveryRadiusM: z.number().int(),
  selfDeliveryFeeTiyin: tiyinSchema,
  minOrderTiyin: tiyinSchema,
  prepMinutes: z.number().int(),
  openingHours: openingHoursSchema,
  acceptingOrders: z.boolean(),
  commissionBp: z.number().int().nullable(),
  cover: z.string().nullable(),
  openNow: z.boolean(),
  menu: z.array(adminMenuCategorySchema),
  createdAt: z.string(),
});
export type AdminRestaurant = z.infer<typeof adminRestaurantSchema>;
export const adminRestaurantListSchema = z.object({
  items: z.array(adminRestaurantSchema.omit({ menu: true })),
});

// ─── Customers ───────────────────────────────────────────────────────────────

/** GET /api/v1/food/restaurants?lat=&lng=&districtId= */
export const restaurantListQuerySchema = z
  .strictObject({
    lat: queryLat.optional(),
    lng: queryLng.optional(),
    districtId: z.uuid().optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'lat and lng go together');

export const restaurantSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: localizedNameSchema,
  description: localizedNameSchema.nullable(),
  cover: z.string().nullable(),
  district: localizedNameSchema.nullable(),
  deliveryMode: foodDeliveryModeSchema,
  /** Open by its hours and taking orders right now. */
  openNow: z.boolean(),
  minOrderTiyin: tiyinSchema,
  prepMinutes: z.number().int(),
  /** With a location: straight-line distance, whether it delivers there, fee and ETA. */
  distanceM: z.number().int().nullable(),
  deliversHere: z.boolean().nullable(),
  deliveryFeeTiyin: tiyinSchema.nullable(),
  etaMinutes: z.number().int().nullable(),
});
export type RestaurantSummary = z.infer<typeof restaurantSummarySchema>;
export const restaurantListSchema = z.object({ items: z.array(restaurantSummarySchema) });

export const restaurantDetailSchema = restaurantSummarySchema.extend({
  address: z.string(),
  phone: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  openingHours: openingHoursSchema,
  menu: z.array(menuCategorySchema),
});
export type RestaurantDetail = z.infer<typeof restaurantDetailSchema>;

export const FOOD_LINES_MAX = 40;
export const foodLineSchema = z.strictObject({
  menuItemId: z.uuid(),
  quantity: z.number().int().min(1).max(50),
});
const foodLines = z
  .array(foodLineSchema)
  .min(1)
  .max(FOOD_LINES_MAX)
  .refine(
    (lines) => new Set(lines.map((l) => l.menuItemId)).size === lines.length,
    'Each dish once',
  );

/** POST /api/v1/food/quote */
export const foodQuoteRequestSchema = z.strictObject({
  restaurantId: z.uuid(),
  items: foodLines,
  lat: latSchema,
  lng: lngSchema,
});
export type FoodQuoteRequest = z.output<typeof foodQuoteRequestSchema>;

export const FOOD_UNAVAILABLE_REASONS = [
  'CLOSED',
  'PAUSED',
  'OUT_OF_AREA',
  'MIN_ORDER',
  'ITEM_UNAVAILABLE',
] as const;
export const foodQuoteSchema = z.object({
  available: z.boolean(),
  reason: z.enum(FOOD_UNAVAILABLE_REASONS).nullable(),
  /** Dishes that are off or removed (reason ITEM_UNAVAILABLE). */
  unavailableItemIds: z.array(z.uuid()),
  itemsTotalTiyin: tiyinSchema,
  deliveryTiyin: tiyinSchema,
  totalTiyin: tiyinSchema,
  minOrderTiyin: tiyinSchema,
  distanceM: z.number().int(),
  etaMinutes: z.number().int(),
});
export type FoodQuote = z.infer<typeof foodQuoteSchema>;

/** POST /api/v1/food/checkout (Idempotency-Key header) → { order } */
export const foodCheckoutSchema = z.strictObject({
  restaurantId: z.uuid(),
  items: foodLines,
  lat: latSchema,
  lng: lngSchema,
  /** Street, house, entrance, flat — what the courier needs. */
  addressLine: z.string().trim().min(3).max(200),
  comment: z.string().trim().max(300).optional(),
  recipientName: z.string().trim().min(2).max(100),
  recipientPhone: phone,
  paymentMethod: paymentMethodSchema,
  expectedTotalTiyin: tiyinSchema,
});
export type FoodCheckoutInput = z.output<typeof foodCheckoutSchema>;

/** GET /api/v1/food/geocode?q=&locale= */
export const geocodeQuerySchema = z.strictObject({
  q: z.string().trim().min(3).max(200),
  locale: z.enum(['uz', 'ru']).default('uz'),
});
export const geocodeResponseSchema = z.object({
  items: z.array(z.object({ lat: z.number(), lng: z.number(), label: z.string() })),
});
/** GET /api/v1/food/reverse?lat=&lng=&locale= */
export const reverseGeocodeQuerySchema = z.strictObject({
  lat: queryLat,
  lng: queryLng,
  locale: z.enum(['uz', 'ru']).default('uz'),
});
export const reverseGeocodeResponseSchema = z.object({ label: z.string().nullable() });

// ─── Restaurant team ─────────────────────────────────────────────────────────

/** GET /api/v1/restaurant/:storeId/orders?scope=active|all */
export const restaurantOrdersQuerySchema = z.strictObject({
  scope: z.enum(['active', 'all']).default('active'),
});
export const restaurantOrderSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  status: sellerOrderStatusSchema,
  createdAt: z.string(),
  /** NEW orders not accepted by then are cancelled automatically. */
  acceptBy: z.string().nullable(),
  items: z.array(
    z.object({
      name: localizedNameSchema,
      quantity: z.number().int(),
      lineTotalTiyin: tiyinSchema,
    }),
  ),
  itemsTotalTiyin: tiyinSchema,
  /** What the restaurant is paid on (items + own delivery fee for SELF). */
  totalTiyin: tiyinSchema,
  paymentMethod: paymentMethodSchema,
  /** Cash orders the restaurant delivers itself: amount to collect. */
  collectTiyin: tiyinSchema.nullable(),
  deliveryMode: foodDeliveryModeSchema,
  recipientName: z.string(),
  recipientPhone: z.string(),
  addressLine: z.string(),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  comment: z.string().nullable(),
  courier: z.object({ name: z.string().nullable(), phone: z.string() }).nullable(),
  allowedTransitions: z.array(sellerOrderStatusSchema),
});
export type RestaurantOrder = z.infer<typeof restaurantOrderSchema>;
export const restaurantOrderListSchema = z.object({ items: z.array(restaurantOrderSchema) });

/** PATCH /api/v1/restaurant/:storeId/settings */
export const restaurantSettingsSchema = z.strictObject({ acceptingOrders: z.boolean() });
/** PATCH /api/v1/restaurant/:storeId/menu-items/:id — sold out today or back. */
export const menuAvailabilitySchema = z.strictObject({ available: z.boolean() });

// ─── Couriers ────────────────────────────────────────────────────────────────

/** PUT /api/v1/courier/status — go online (with position) or offline. */
export const courierStatusInputSchema = z.strictObject({
  online: z.boolean(),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
});
/** PUT /api/v1/courier/location (≤ 1 per 10 s) */
export const courierLocationSchema = pointSchema;

export const courierJobSchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  status: sellerOrderStatusSchema,
  restaurant: z.object({
    name: localizedNameSchema,
    address: z.string(),
    phone: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
  }),
  /** Customer details only after the courier took the order. */
  customer: z
    .object({
      name: z.string(),
      phone: z.string(),
      addressLine: z.string(),
      comment: z.string().nullable(),
      lat: z.number(),
      lng: z.number(),
    })
    .nullable(),
  /** Restaurant → customer straight-line distance. */
  distanceM: z.number().int(),
  /** Courier → restaurant, when the courier's position is known. */
  toRestaurantM: z.number().int().nullable(),
  feeTiyin: tiyinSchema,
  /** Cash to collect from the customer (null when paid online). */
  collectTiyin: tiyinSchema.nullable(),
  readyAt: z.string().nullable(),
  allowedTransitions: z.array(sellerOrderStatusSchema),
});
export type CourierJob = z.infer<typeof courierJobSchema>;

export const courierMeSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  vehicle: courierVehicleSchema,
  online: z.boolean(),
  /** What UZGO owes the courier (negative: cash the courier must hand in). */
  balanceTiyin: z.string().regex(/^-?\d+$/),
  active: z.array(courierJobSchema),
});
export type CourierMe = z.infer<typeof courierMeSchema>;
export const courierOffersSchema = z.object({ items: z.array(courierJobSchema) });

/** POST /api/v1/courier/orders/:id/transition */
export const courierTransitionSchema = z.strictObject({
  to: z.enum(['HANDED_TO_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED']),
  reason: z.string().trim().max(300).optional(),
});

// ─── Staff: couriers ─────────────────────────────────────────────────────────

/** POST /api/v1/admin/couriers — an existing account becomes a courier. */
export const createCourierSchema = z.strictObject({
  phone,
  vehicle: courierVehicleSchema.default('SCOOTER'),
});
export const updateCourierSchema = z
  .strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']), vehicle: courierVehicleSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** POST /api/v1/admin/couriers/:userId/settlements */
export const courierSettlementSchema = z.strictObject({
  /** Positive: UZGO paid the courier; negative: the courier handed in cash. */
  amountTiyin: z
    .string()
    .regex(/^-?\d+$/)
    .refine((v) => BigInt(v) !== 0n, 'Must not be zero'),
  note: z.string().trim().max(300).optional(),
});

export const adminCourierSchema = z.object({
  userId: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  vehicle: courierVehicleSchema,
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
  balanceTiyin: z.string().regex(/^-?\d+$/),
  activeOrders: z.number().int(),
  delivered: z.number().int(),
});
export type AdminCourier = z.infer<typeof adminCourierSchema>;
export const adminCourierListSchema = z.object({ items: z.array(adminCourierSchema) });
