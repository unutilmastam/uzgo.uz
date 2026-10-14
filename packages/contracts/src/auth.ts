import { z } from 'zod';

export const ROLES = [
  'CUSTOMER',
  'SELLER_OWNER',
  'SELLER_STAFF',
  'MODERATOR',
  'ADMIN',
  'SUPER_ADMIN',
] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const localeSchema = z.enum(['uz', 'ru']);
export type AppLocale = z.infer<typeof localeSchema>;

/**
 * Phone as typed by the user. The API normalises and validates it to E.164
 * with a phone-number library; this schema only bounds the input.
 */
export const phoneInputSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^[+\d\s()-]+$/, 'Invalid phone number');

export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'The code has 6 digits');

/** POST /api/v1/auth/otp/request */
export const otpRequestSchema = z.strictObject({
  phone: phoneInputSchema,
  locale: localeSchema.optional(),
});
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpRequestResponseSchema = z.object({
  expiresInSeconds: z.number().int().positive(),
  resendInSeconds: z.number().int().nonnegative(),
});
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;

/** POST /api/v1/auth/otp/verify */
export const otpVerifySchema = z.strictObject({
  phone: phoneInputSchema,
  code: otpCodeSchema,
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

export const currentUserSchema = z.object({
  id: z.uuid(),
  phone: z.string(),
  locale: localeSchema,
  roles: z.array(roleSchema),
  profile: z.object({
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    districtId: z.uuid().nullable(),
    regionId: z.uuid().nullable(),
  }),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** GET /api/v1/auth/me and POST /api/v1/auth/otp/verify */
export const currentUserResponseSchema = z.object({ user: currentUserSchema });

const personName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\p{L}\p{M}ʻʼ' .-]+$/u, 'Letters only');

/** PATCH /api/v1/users/me — all fields optional; null clears a value. */
export const updateProfileSchema = z
  .strictObject({
    firstName: personName.nullable().optional(),
    lastName: personName.nullable().optional(),
    districtId: z.uuid().nullable().optional(),
    locale: localeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

/** POST /api/v1/admin/users/:userId/roles */
export const grantRoleSchema = z.strictObject({ role: roleSchema });
