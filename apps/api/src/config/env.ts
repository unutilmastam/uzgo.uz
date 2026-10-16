import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const originList = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z
      .array(
        z.url({ protocol: /^https?$/ }).refine((origin) => URL.parse(origin)?.origin === origin, {
          message: 'must be a bare origin like https://uzgo.uz (no path, no trailing slash)',
        }),
      )
      .min(1),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).describe('PostgreSQL connection string'),
    CORS_ORIGINS: originList,
    BODY_LIMIT: z
      .string()
      .regex(/^\d+(b|kb|mb)$/i, 'must look like 100kb or 1mb')
      .default('1mb'),
    SWAGGER_ENABLED: booleanString.optional(),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    /** Secret for HMAC of OTP codes and IP addresses. Rotate = invalidates pending codes. */
    AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** dev: logs codes (development only). fake: in-memory (tests only). eskiz: real gateway. */
    SMS_PROVIDER: z.enum(['dev', 'fake', 'eskiz']),
    ESKIZ_EMAIL: z.email().optional(),
    ESKIZ_PASSWORD: z.string().min(1).max(200).optional(),
    /** Sender name/number approved by Eskiz ("4546" is the shared default). */
    ESKIZ_FROM: z.string().min(1).max(20).default('4546'),
    ESKIZ_BASE_URL: z.url({ protocol: /^https$/ }).default('https://notify.eskiz.uz/api'),
    /** Max OTP requests per client IP per hour (abuse / SMS pumping protection). */
    OTP_IP_HOURLY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(20),
    /** 32-byte key (base64) that encrypts staff TOTP secrets at rest. */
    TOTP_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded'),
    /** Staff (moderator/admin) routes require a verified TOTP second factor. Always true in production. */
    STAFF_TOTP_REQUIRED: booleanString.default(true),
    /**
     * Browser e2e only: turns off the per-IP request throttler (every e2e login
     * comes from 127.0.0.1). Allowed only with NODE_ENV=test. The OTP limits
     * stored in the database still apply.
     */
    RATE_LIMIT_DISABLED: booleanString.default(false),
    /** Commission when neither the store nor its category sets one (basis points; owner decision). */
    COMMISSION_DEFAULT_BP: z.coerce.number().int().min(0).max(5000).default(0),
    /** Delivered earnings stay on hold this many days (return window) before payout. */
    PAYOUT_HOLD_DAYS: z.coerce.number().int().min(0).max(90).default(10),
    /**
     * Days after delivery in which the customer can request a return in the app
     * (ADR 0023). In production it must not exceed PAYOUT_HOLD_DAYS: money
     * already paid out cannot be refunded from the seller's balance.
     */
    RETURN_WINDOW_DAYS: z.coerce.number().int().min(1).max(90).default(10),
    /** UZGO Food (ADR 0024): courier tariff = base + per km of road distance (tiyin). */
    FOOD_COURIER_BASE_TIYIN: z.coerce.number().int().min(0).max(100_000_000).default(800_000),
    FOOD_COURIER_PER_KM_TIYIN: z.coerce.number().int().min(0).max(10_000_000).default(200_000),
    /** Online couriers see offers from restaurants within this distance. */
    FOOD_OFFER_RADIUS_KM: z.coerce.number().int().min(1).max(50).default(5),
    /** A restaurant that does not accept an order in time: the order is cancelled. */
    FOOD_ACCEPT_TIMEOUT_MINUTES: z.coerce.number().int().min(2).max(60).default(10),
    /** UZGO Go (ADR 0025): fixed price = base + per km of road distance, per class (tiyin). */
    RIDE_ECONOMY_BASE_TIYIN: z.coerce.number().int().min(0).max(100_000_000).default(700_000),
    RIDE_ECONOMY_PER_KM_TIYIN: z.coerce.number().int().min(0).max(10_000_000).default(250_000),
    RIDE_COMFORT_BASE_TIYIN: z.coerce.number().int().min(0).max(100_000_000).default(1_000_000),
    RIDE_COMFORT_PER_KM_TIYIN: z.coerce.number().int().min(0).max(10_000_000).default(350_000),
    /** UZGO commission on each ride, basis points (1000 = 10 %). */
    RIDE_COMMISSION_BP: z.coerce.number().int().min(0).max(5000).default(1000),
    /** Longest ride accepted (straight-line km between pickup and drop-off). */
    RIDE_MAX_KM: z.coerce.number().int().min(5).max(1000).default(150),
    /** Online drivers see requests whose pickup is within this distance. */
    RIDE_OFFER_RADIUS_KM: z.coerce.number().int().min(1).max(50).default(5),
    /** Nobody accepted the ride in time: NO_DRIVER (online payment refunded). */
    RIDE_SEARCH_TIMEOUT_MINUTES: z.coerce.number().int().min(2).max(60).default(10),
    /** Fiscal receipt line for rides paid with Payme/Click (IKPU, package code, VAT %). */
    RIDE_MXIK_CODE: z
      .string()
      .regex(/^\d{17}$/)
      .optional(),
    RIDE_PACKAGE_CODE: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
    RIDE_VAT_PERCENT: z.coerce.number().int().min(0).max(100).default(0),
    /**
     * Shopping assistant (ADR 0026). Without ANTHROPIC_API_KEY the assistant is off.
     * The fake provider is for tests and local development only (refused in production).
     */
    ANTHROPIC_API_KEY: z.string().min(20).max(400).optional(),
    ASSISTANT_PROVIDER: z.enum(['anthropic', 'fake']).default('anthropic'),
    ASSISTANT_MODEL: z.string().min(3).max(100).default('claude-opus-5-5'),
    ASSISTANT_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
    /** Messages per signed-in user per Tashkent day. */
    ASSISTANT_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
    /** Input + output tokens for all users per calendar month; 0 = no assistant. */
    ASSISTANT_MONTHLY_TOKEN_BUDGET: z.coerce
      .number()
      .int()
      .min(0)
      .max(10_000_000_000)
      .default(30_000_000),
    /** OpenStreetMap Nominatim (address search). Own instance: set its URL. */
    NOMINATIM_URL: z.url({ protocol: /^https?$/ }).default('https://nominatim.openstreetmap.org'),
    /** Contact e-mail sent in the User-Agent (Nominatim usage policy); required in production. */
    GEOCODER_CONTACT: z.email().optional(),
    /** Unpaid online orders are cancelled (stock released) after this many minutes. */
    PAYMENT_WINDOW_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(30),
    /** Public web origin for payment return URLs, e.g. https://uzgo.uz (defaults to the first CORS origin). */
    WEB_PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** DEVELOPMENT / TESTS ONLY: offers a simulated online payment. Refused in production. */
    DEV_PAYMENTS_ENABLED: booleanString.default(false),
    /** Payme Merchant API (ADR 0017). The method is offered only when both are set. */
    PAYME_MERCHANT_ID: z.string().min(1).max(64).optional(),
    PAYME_KEY: z.string().min(8).max(200).optional(),
    /** Optional allow-list of Payme's callback IPs (comma separated); needs TRUST_PROXY behind a proxy. */
    PAYME_ALLOWED_IPS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((ip) => ip.trim())
          .filter((ip) => ip.length > 0),
      )
      .pipe(z.array(z.union([z.ipv4(), z.ipv6()]))),
    PAYME_CHECKOUT_URL: z.url({ protocol: /^https$/ }).default('https://checkout.paycom.uz'),
    /** Click SHOP API (ADR 0017). The method is offered only when all four are set. */
    CLICK_SERVICE_ID: z
      .string()
      .regex(/^\d{1,12}$/)
      .optional(),
    CLICK_MERCHANT_ID: z
      .string()
      .regex(/^\d{1,12}$/)
      .optional(),
    CLICK_MERCHANT_USER_ID: z
      .string()
      .regex(/^\d{1,12}$/)
      .optional(),
    CLICK_SECRET_KEY: z.string().min(8).max(200).optional(),
    CLICK_PAY_URL: z.url({ protocol: /^https$/ }).default('https://my.click.uz/services/pay'),
    /** Telegram bot token for seller notifications (without it messages are only logged). */
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d{5,15}:[\w-]{30,60}$/, 'must look like a Telegram bot token')
      .optional(),
    /** Expo push access token (optional "enhanced security" of the Expo push API, ADR 0022). */
    EXPO_ACCESS_TOKEN: z.string().min(20).max(200).optional(),
    /** Development only: really send pushes through Expo (default: log them). */
    EXPO_PUSH_ENABLED: booleanString.default(false),
    /** Shared secret of the web server's server-to-server calls (rate limiting per visitor). */
    INTERNAL_API_TOKEN: z.string().min(32, 'must be at least 32 characters').optional(),
    /** Ops Telegram chat for operator alerts (5xx errors, failing jobs). Needs TELEGRAM_BOT_TOKEN. */
    ALERT_TELEGRAM_CHAT_ID: z
      .string()
      .regex(/^-?\d{1,20}$/, 'must be a numeric Telegram chat id')
      .optional(),
    /** local = LocalDiskStorage on a persistent volume (single server, ADR 0020). */
    STORAGE_DRIVER: z.enum(['local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('./uploads'),
    /** Base URL under which stored images are public. */
    MEDIA_PUBLIC_BASE_URL: z.string().min(1).default('/api/v1/media'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.ASSISTANT_PROVIDER === 'fake') {
      ctx.addIssue({
        code: 'custom',
        message: 'The fake assistant is not allowed in production',
        path: ['ASSISTANT_PROVIDER'],
      });
    }
    if (env.NODE_ENV === 'production' && !env.GEOCODER_CONTACT) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEOCODER_CONTACT'],
        message: 'required in production (OpenStreetMap usage policy)',
      });
    }
    // Tests shorten the hold to 0 to exercise payouts; production keeps the rule.
    if (env.NODE_ENV === 'production' && env.RETURN_WINDOW_DAYS > env.PAYOUT_HOLD_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['RETURN_WINDOW_DAYS'],
        message: 'must not exceed PAYOUT_HOLD_DAYS',
      });
    }
    if (env.SMS_PROVIDER === 'dev' && env.NODE_ENV !== 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'the dev SMS provider is allowed only when NODE_ENV=development',
      });
    }
    if (env.SMS_PROVIDER === 'fake' && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'the fake SMS provider is allowed only when NODE_ENV=test',
      });
    }
    if (env.RATE_LIMIT_DISABLED && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_DISABLED'],
        message: 'rate limiting can be disabled only when NODE_ENV=test',
      });
    }
    if (env.SMS_PROVIDER === 'eskiz') {
      for (const key of ['ESKIZ_EMAIL', 'ESKIZ_PASSWORD'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when SMS_PROVIDER=eskiz',
          });
        }
      }
    }
    if (env.DEV_PAYMENTS_ENABLED && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_PAYMENTS_ENABLED'],
        message: 'simulated payments cannot be enabled in production',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    if (!env.STAFF_TOTP_REQUIRED) {
      ctx.addIssue({
        code: 'custom',
        path: ['STAFF_TOTP_REQUIRED'],
        message: 'the staff second factor cannot be disabled in production',
      });
    }
    if (!env.INTERNAL_API_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['INTERNAL_API_TOKEN'],
        message:
          'required in production (otherwise all server-rendered pages share one rate limit)',
      });
    }
    // Production keeps uploads on a mounted volume with an absolute path
    // (never relative to the working directory of the process).
    if (!env.STORAGE_LOCAL_DIR.startsWith('/')) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_LOCAL_DIR'],
        message: 'must be an absolute path to a persistent volume in production',
      });
    }
    for (const origin of env.CORS_ORIGINS) {
      if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `production origins must use https: ${origin}`,
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
    WEB_PUBLIC_URL: env.WEB_PUBLIC_URL ?? env.CORS_ORIGINS[0] ?? 'http://localhost:3000',
  }));

export type Env = z.output<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates environment variables. Throws EnvValidationError listing every
 * problem. Error messages name the variable but never echo its value, so
 * secrets cannot leak into logs.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
