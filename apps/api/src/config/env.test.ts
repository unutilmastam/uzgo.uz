import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/uzgo',
  CORS_ORIGINS: 'http://localhost:3000, https://uzgo.uz',
  AUTH_SECRET: 'x'.repeat(40),
  SMS_PROVIDER: 'dev',
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

function errorOf(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error('expected EnvValidationError');
}

describe('parseEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.BODY_LIMIT).toBe('1mb');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://uzgo.uz']);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.TRUST_PROXY).toBe(0);
  });

  it('rejects a missing DATABASE_URL and NODE_ENV', () => {
    const error = errorOf(() => parseEnv({ CORS_ORIGINS: 'http://localhost:3000' }));
    expect(error.issues.some((issue) => issue.startsWith('DATABASE_URL'))).toBe(true);
    expect(error.issues.some((issue) => issue.startsWith('NODE_ENV'))).toBe(true);
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost/uzgo' })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnv({ ...valid, PORT: '70000' })).toThrow(EnvValidationError);
    expect(() => parseEnv({ ...valid, PORT: 'abc' })).toThrow(EnvValidationError);
  });

  it('rejects wildcard or path-bearing CORS origins', () => {
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: '*' })).toThrow(EnvValidationError);
    expect(() => parseEnv({ ...valid, CORS_ORIGINS: 'https://uzgo.uz/' })).toThrow(
      EnvValidationError,
    );
  });

  it('requires https origins in production', () => {
    const error = errorOf(() => parseEnv({ ...valid, NODE_ENV: 'production' }));
    expect(error.issues.some((issue) => issue.startsWith('CORS_ORIGINS'))).toBe(true);
  });

  it('refuses development/test SMS providers outside their environment', () => {
    for (const NODE_ENV of ['production', 'test']) {
      const error = errorOf(() => parseEnv({ ...valid, NODE_ENV, SMS_PROVIDER: 'dev' }));
      expect(error.issues.some((issue) => issue.startsWith('SMS_PROVIDER'))).toBe(true);
    }
    for (const NODE_ENV of ['production', 'development']) {
      const error = errorOf(() => parseEnv({ ...valid, NODE_ENV, SMS_PROVIDER: 'fake' }));
      expect(error.issues.some((issue) => issue.startsWith('SMS_PROVIDER'))).toBe(true);
    }
  });

  it('requires an absolute upload volume path and real SMS in production', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://uzgo.uz',
      SMS_PROVIDER: 'eskiz',
      ESKIZ_EMAIL: 'ops@example.uz',
      ESKIZ_PASSWORD: 'placeholder',
      INTERNAL_API_TOKEN: 'i'.repeat(40),
    };
    const error = errorOf(() => parseEnv(production));
    expect(error.issues.some((issue) => issue.startsWith('STORAGE_LOCAL_DIR'))).toBe(true);
    const env = parseEnv({ ...production, STORAGE_LOCAL_DIR: '/data/uploads' });
    expect(env.STORAGE_LOCAL_DIR).toBe('/data/uploads');
    expect(env.ESKIZ_FROM).toBe('4546');
    const devSms = errorOf(() =>
      parseEnv({ ...production, SMS_PROVIDER: 'dev', STORAGE_LOCAL_DIR: '/data/uploads' }),
    );
    expect(devSms.issues.some((issue) => issue.startsWith('SMS_PROVIDER'))).toBe(true);
    const noCreds = errorOf(() =>
      parseEnv({ ...production, ESKIZ_PASSWORD: undefined, STORAGE_LOCAL_DIR: '/data/uploads' }),
    );
    expect(noCreds.issues.some((issue) => issue.startsWith('ESKIZ_PASSWORD'))).toBe(true);
    const noToken = errorOf(() =>
      parseEnv({
        ...production,
        INTERNAL_API_TOKEN: undefined,
        STORAGE_LOCAL_DIR: '/data/uploads',
      }),
    );
    expect(noToken.issues.some((issue) => issue.startsWith('INTERNAL_API_TOKEN'))).toBe(true);
  });

  it('requires a 32-byte TOTP key and keeps staff 2FA on in production', () => {
    expect(() => parseEnv({ ...valid, TOTP_ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow(
      EnvValidationError,
    );
    expect(parseEnv(valid).STAFF_TOTP_REQUIRED).toBe(true);
    const error = errorOf(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://uzgo.uz',
        STAFF_TOTP_REQUIRED: 'false',
      }),
    );
    expect(error.issues.some((issue) => issue.startsWith('STAFF_TOTP_REQUIRED'))).toBe(true);
  });

  it('requires a long AUTH_SECRET', () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: 'short' })).toThrow(EnvValidationError);
  });

  it('never echoes secret values in error messages', () => {
    const error = errorOf(() =>
      parseEnv({ ...valid, DATABASE_URL: 'not a url but contains secret-password' }),
    );
    expect(error.message).not.toContain('secret-password');
  });

  it('allows disabling the request throttler only in tests', () => {
    expect(parseEnv(valid).RATE_LIMIT_DISABLED).toBe(false);
    const error = errorOf(() => parseEnv({ ...valid, RATE_LIMIT_DISABLED: 'true' }));
    expect(error.issues.some((issue) => issue.startsWith('RATE_LIMIT_DISABLED'))).toBe(true);
    expect(
      parseEnv({ ...valid, NODE_ENV: 'test', SMS_PROVIDER: 'fake', RATE_LIMIT_DISABLED: 'true' })
        .RATE_LIMIT_DISABLED,
    ).toBe(true);
  });

  it('never allows simulated payments in production', () => {
    expect(parseEnv(valid).DEV_PAYMENTS_ENABLED).toBe(false);
    expect(parseEnv({ ...valid, DEV_PAYMENTS_ENABLED: 'true' }).DEV_PAYMENTS_ENABLED).toBe(true);
    const error = errorOf(() =>
      parseEnv({ ...valid, NODE_ENV: 'production', DEV_PAYMENTS_ENABLED: 'true' }),
    );
    expect(error.issues.some((issue) => issue.startsWith('DEV_PAYMENTS_ENABLED'))).toBe(true);
  });

  it('validates payment credentials and defaults the public web URL', () => {
    expect(parseEnv(valid).WEB_PUBLIC_URL).toBe('http://localhost:3000');
    expect(() => parseEnv({ ...valid, CLICK_SERVICE_ID: 'abc' })).toThrow(EnvValidationError);
    expect(() => parseEnv({ ...valid, PAYME_CHECKOUT_URL: 'http://checkout.paycom.uz' })).toThrow(
      EnvValidationError,
    );
  });
});
