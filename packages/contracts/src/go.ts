import { z } from 'zod';
import { latSchema, lngSchema, pointSchema } from './food.js';
import { paymentMethodSchema } from './orders.js';
import { tiyinSchema } from './products.js';

// ─── UZGO Go: ride-hailing (Phase 9c, ADR 0025) ─────────────────────────────

export const RIDE_CLASSES = ['ECONOMY', 'COMFORT'] as const;
export const rideClassSchema = z.enum(RIDE_CLASSES);
export type RideClass = z.infer<typeof rideClassSchema>;

export const RIDE_STATUSES = [
  'AWAITING_PAYMENT',
  'SEARCHING',
  'ACCEPTED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_DRIVER',
] as const;
export const rideStatusSchema = z.enum(RIDE_STATUSES);
export type RideStatus = z.infer<typeof rideStatusSchema>;

export const DRIVER_STATUSES = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const;
export const driverStatusSchema = z.enum(DRIVER_STATUSES);
export type DriverStatus = z.infer<typeof driverStatusSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);
const signedTiyin = z.string().regex(/^-?\d+$/);

/** A point the rider picked, with the label shown to the driver. */
export const ridePlaceSchema = z.strictObject({
  lat: latSchema,
  lng: lngSchema,
  label: text(200),
});
export type RidePlace = z.infer<typeof ridePlaceSchema>;

/** POST /api/v1/rides/quote (public) */
export const rideQuoteRequestSchema = z.strictObject({ pickup: pointSchema, dropoff: pointSchema });
export type RideQuoteRequest = z.infer<typeof rideQuoteRequestSchema>;

export const rideQuoteSchema = z.object({
  /** Straight-line distance between the points. */
  distanceM: z.number().int(),
  /** Estimated trip time. */
  etaMinutes: z.number().int(),
  /** Too long for one ride (RIDE_MAX_KM); options are still priced for information. */
  tooFar: z.boolean(),
  options: z.array(z.object({ rideClass: rideClassSchema, priceTiyin: tiyinSchema })),
  /** Online drivers near the pickup point right now, per class. */
  driversNearby: z.object({ ECONOMY: z.number().int(), COMFORT: z.number().int() }),
});
export type RideQuote = z.infer<typeof rideQuoteSchema>;

/** POST /api/v1/rides (Idempotency-Key) */
export const rideRequestSchema = z.strictObject({
  rideClass: rideClassSchema,
  pickup: ridePlaceSchema,
  dropoff: ridePlaceSchema,
  /** Pickup district (prefilled from the profile). */
  districtId: z.uuid(),
  paymentMethod: paymentMethodSchema,
  /** The price the rider saw; a different server price is refused (PRICE_CHANGED). */
  expectedPriceTiyin: tiyinSchema,
  comment: z.string().trim().max(300).optional(),
});
export type RideRequestInput = z.infer<typeof rideRequestSchema>;

export const rideCarSchema = z.object({
  make: z.string(),
  model: z.string(),
  color: z.string(),
  year: z.number().int(),
  plate: z.string(),
});
export type RideCar = z.infer<typeof rideCarSchema>;

export const ridePointSchema = z.object({ lat: z.number(), lng: z.number(), label: z.string() });

export const rideViewSchema = z.object({
  number: z.string(),
  status: rideStatusSchema,
  rideClass: rideClassSchema,
  pickup: ridePointSchema,
  dropoff: ridePointSchema,
  distanceM: z.number().int(),
  etaMinutes: z.number().int(),
  priceTiyin: tiyinSchema,
  paymentMethod: paymentMethodSchema,
  /** Online and not paid yet: the rider can open the payment page until paymentDueAt. */
  awaitingPayment: z.boolean(),
  paymentDueAt: z.string().nullable(),
  paid: z.boolean(),
  /** Money going back to the rider for a cancelled paid ride. */
  refund: z.object({ amountTiyin: tiyinSchema, status: z.string() }).nullable(),
  comment: z.string().nullable(),
  /** Only while the ride is with a driver (or done). Position only while active. */
  driver: z
    .object({
      name: z.string(),
      phone: z.string().nullable(),
      car: rideCarSchema,
      position: z.object({ lat: z.number(), lng: z.number(), at: z.string() }).nullable(),
    })
    .nullable(),
  canCancel: z.boolean(),
  createdAt: z.string(),
  acceptedAt: z.string().nullable(),
  arrivedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  cancelledBy: z.enum(['CUSTOMER', 'DRIVER', 'ADMIN', 'SYSTEM']).nullable(),
});
export type RideView = z.infer<typeof rideViewSchema>;

export const rideSummarySchema = z.object({
  number: z.string(),
  status: rideStatusSchema,
  rideClass: rideClassSchema,
  pickupLabel: z.string(),
  dropoffLabel: z.string(),
  priceTiyin: tiyinSchema,
  createdAt: z.string(),
});
export type RideSummary = z.infer<typeof rideSummarySchema>;
export const rideListSchema = z.object({ items: z.array(rideSummarySchema) });

// ─── Drivers ────────────────────────────────────────────────────────────────

/** Upper case, no spaces or dashes: "01 A 123 BC" → "01A123BC". */
export const plateNumberSchema = z
  .string()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{2}[A-Z0-9]{5,7}$/, 'Plate like 01A123BC'));

/** PUT /api/v1/driver/application — apply, or correct a rejected application. */
export const driverApplicationSchema = z.strictObject({
  firstName: text(60),
  lastName: text(60),
  licenceNumber: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/\s/g, ''))
    .pipe(z.string().regex(/^[A-Z0-9]{6,15}$/, 'Licence number')),
  permitNumber: z.string().trim().max(40).optional(),
  taxId: z
    .string()
    .trim()
    .regex(/^(\d{9}|\d{14})$/, 'STIR (9 digits) or PINFL (14 digits)')
    .optional(),
  carMake: text(40),
  carModel: text(40),
  carColor: text(30),
  carYear: z.number().int().min(1980).max(2100),
  plateNumber: plateNumberSchema,
  rideClass: rideClassSchema.default('ECONOMY'),
  /** The driver accepts the driver terms (ADR 0025). */
  acceptTerms: z.literal(true),
});
export type DriverApplicationInput = z.input<typeof driverApplicationSchema>;

export const driverApplicationViewSchema = z.object({
  status: driverStatusSchema,
  firstName: z.string(),
  lastName: z.string(),
  licenceNumber: z.string(),
  permitNumber: z.string().nullable(),
  taxId: z.string().nullable(),
  car: rideCarSchema,
  rideClass: rideClassSchema,
  /** Why staff rejected or suspended the account. */
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
});
export type DriverApplicationView = z.infer<typeof driverApplicationViewSchema>;
/** GET /api/v1/driver/application */
export const driverApplicationResponseSchema = z.object({
  application: driverApplicationViewSchema.nullable(),
});

export const DRIVER_ACTIONS = ['ARRIVED', 'START', 'COMPLETE', 'RELEASE', 'NO_SHOW'] as const;
export const driverActionSchema = z.enum(DRIVER_ACTIONS);
export type DriverAction = z.infer<typeof driverActionSchema>;
/** POST /api/v1/driver/rides/:id/action */
export const driverActionInputSchema = z.strictObject({ action: driverActionSchema });

export const driverJobSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: rideStatusSchema,
  rideClass: rideClassSchema,
  pickup: ridePointSchema,
  dropoff: ridePointSchema,
  /** Pickup → drop-off straight-line distance. */
  distanceM: z.number().int(),
  /** Driver → pickup, when the driver's position is known. */
  toPickupM: z.number().int().nullable(),
  priceTiyin: tiyinSchema,
  /** What the driver earns (price − UZGO commission). */
  earningsTiyin: tiyinSchema,
  /** Cash to take from the rider (null when paid online). */
  collectTiyin: tiyinSchema.nullable(),
  /** Rider details only after the driver took the ride. */
  rider: z
    .object({ name: z.string(), phone: z.string(), comment: z.string().nullable() })
    .nullable(),
  allowedActions: z.array(driverActionSchema),
});
export type DriverJob = z.infer<typeof driverJobSchema>;

export const driverMeSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  rideClass: rideClassSchema,
  online: z.boolean(),
  car: rideCarSchema,
  /** What UZGO owes the driver (negative: commission the driver must hand in). */
  balanceTiyin: signedTiyin,
  active: driverJobSchema.nullable(),
});
export type DriverMe = z.infer<typeof driverMeSchema>;
export const driverOffersSchema = z.object({ items: z.array(driverJobSchema) });

/** PUT /api/v1/driver/status — go online (with position) or offline. */
export const driverStatusInputSchema = z.strictObject({
  online: z.boolean(),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
});
/** PUT /api/v1/driver/location (≤ 1 per 5 s) */
export const driverLocationSchema = pointSchema;

// ─── Staff: drivers and rides ───────────────────────────────────────────────

export const adminDriverListQuerySchema = z.strictObject({
  status: driverStatusSchema.optional(),
});

/** POST /api/v1/admin/drivers/:userId/review */
export const driverReviewSchema = z
  .strictObject({
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().max(300).optional(),
    rideClass: rideClassSchema.optional(),
  })
  .refine((v) => v.decision === 'APPROVE' || (v.note ?? '').length > 0, {
    message: 'A rejection needs a note for the driver',
    path: ['note'],
  });

/** PATCH /api/v1/admin/drivers/:userId */
export const updateDriverSchema = z
  .strictObject({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    rideClass: rideClassSchema,
    note: z.string().trim().max(300),
  })
  .partial()
  .refine((v) => v.status !== undefined || v.rideClass !== undefined, 'Nothing to update');

/** POST /api/v1/admin/drivers/:userId/settlements */
export const driverSettlementSchema = z.strictObject({
  /** Positive: UZGO paid the driver; negative: the driver handed in commission. */
  amountTiyin: signedTiyin.refine((v) => BigInt(v) !== 0n, 'Must not be zero'),
  note: z.string().trim().max(300).optional(),
});

export const adminDriverSchema = z.object({
  userId: z.uuid(),
  phone: z.string(),
  status: driverStatusSchema,
  firstName: z.string(),
  lastName: z.string(),
  licenceNumber: z.string(),
  permitNumber: z.string().nullable(),
  taxId: z.string().nullable(),
  car: rideCarSchema,
  rideClass: rideClassSchema,
  reviewNote: z.string().nullable(),
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
  balanceTiyin: signedTiyin,
  completedRides: z.number().int(),
  createdAt: z.string(),
});
export type AdminDriver = z.infer<typeof adminDriverSchema>;
export const adminDriverListSchema = z.object({ items: z.array(adminDriverSchema) });

export const adminRideListQuerySchema = z.strictObject({
  status: rideStatusSchema.optional(),
});
export const adminRideSchema = z.object({
  number: z.string(),
  status: rideStatusSchema,
  rideClass: rideClassSchema,
  priceTiyin: tiyinSchema,
  paymentMethod: paymentMethodSchema,
  paid: z.boolean(),
  riderPhone: z.string(),
  driverPhone: z.string().nullable(),
  pickupLabel: z.string(),
  dropoffLabel: z.string(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminRide = z.infer<typeof adminRideSchema>;
export const adminRideListSchema = z.object({ items: z.array(adminRideSchema) });

/** POST /api/v1/admin/rides/:number/cancel and /api/v1/rides/:number/cancel */
export const rideCancelSchema = z.strictObject({ reason: z.string().trim().max(300).optional() });
export const adminRideCancelSchema = z.strictObject({ reason: text(300) });
