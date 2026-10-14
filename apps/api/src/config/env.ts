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
    /** dev: logs codes (development only). fake: in-memory (tests only). Real providers later. */
    SMS_PROVIDER: z.enum(['dev', 'fake']),
    /** Max OTP requests per client IP per hour (abuse / SMS pumping protection). */
    OTP_IP_HOURLY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(20),
  })
  .superRefine((env, ctx) => {
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
    if (env.NODE_ENV !== 'production') return;
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
