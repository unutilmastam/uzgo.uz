import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/uzgo',
  CORS_ORIGINS: 'http://localhost:3000, https://uzgo.uz',
  AUTH_SECRET: 'x'.repeat(40),
  SMS_PROVIDER: 'dev',
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

  it('refuses local disk storage in production', () => {
    const error = errorOf(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://uzgo.uz',
        SMS_PROVIDER: 'dev',
      }),
    );
    expect(error.issues.some((issue) => issue.startsWith('STORAGE_DRIVER'))).toBe(true);
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
});
