import { z } from 'zod';
import { localizedNameSchema } from './geo.js';

// Food types used by order views (kept apart from food.ts to avoid an import cycle).

export const FOOD_DELIVERY_MODES = ['SELF', 'UZGO'] as const;
export const foodDeliveryModeSchema = z.enum(FOOD_DELIVERY_MODES);
export type FoodDeliveryMode = z.infer<typeof foodDeliveryModeSchema>;

export const COURIER_VEHICLES = ['FOOT', 'BICYCLE', 'SCOOTER', 'CAR'] as const;
export const courierVehicleSchema = z.enum(COURIER_VEHICLES);

/** Food part of an order view (null for marketplace orders). */
export const foodOrderInfoSchema = z.object({
  deliveryMode: foodDeliveryModeSchema,
  restaurant: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: localizedNameSchema,
    phone: z.string().nullable(),
    lat: z.number(),
    lng: z.number(),
  }),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  /** Estimated delivery moment while the order is active. */
  etaAt: z.string().nullable(),
  /** UZGO courier, once one took the order; position only while delivering. */
  courier: z
    .object({
      name: z.string().nullable(),
      phone: z.string(),
      vehicle: courierVehicleSchema,
      position: z.object({ lat: z.number(), lng: z.number(), at: z.string() }).nullable(),
    })
    .nullable(),
});
export type FoodOrderInfo = z.infer<typeof foodOrderInfoSchema>;
