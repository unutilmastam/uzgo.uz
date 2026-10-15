import { z } from 'zod';
import { currentUserSchema } from './auth.js';

/**
 * Mobile app protocol (ADR 0022). The app sends `X-UZGO-Client: mobile`;
 * the API then returns the session token in the body (no cookies) and the app
 * sends it back as `Authorization: Bearer <token>`. A guest cart travels in the
 * `X-Cart-Token` request/response header.
 */
export const MOBILE_CLIENT_HEADER = 'x-uzgo-client';
export const MOBILE_CLIENT_VALUE = 'mobile';
export const CART_TOKEN_HEADER = 'x-cart-token';

export const mobileLoginResponseSchema = z.object({
  user: currentUserSchema,
  session: z.object({ token: z.string().min(32), expiresAt: z.iso.datetime() }),
});
export type MobileLoginResponse = z.infer<typeof mobileLoginResponseSchema>;

/** Expo push token, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]". */
export const expoPushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[^\]\s]{10,200}\]$/, 'Not an Expo push token');

export const registerPushDeviceSchema = z.strictObject({
  token: expoPushTokenSchema,
  platform: z.enum(['IOS', 'ANDROID']),
});
export type RegisterPushDevice = z.infer<typeof registerPushDeviceSchema>;

export const unregisterPushDeviceSchema = z.strictObject({ token: expoPushTokenSchema });
export type UnregisterPushDevice = z.infer<typeof unregisterPushDeviceSchema>;

/** Deep-link payload of a push notification. */
export const pushDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('order'), number: z.string() }),
  z.object({ type: z.literal('shipment'), storeId: z.uuid() }),
  /** A new UZGO Food delivery offer nearby (courier mode). */
  z.object({ type: z.literal('courier') }),
]);
export type PushData = z.infer<typeof pushDataSchema>;
