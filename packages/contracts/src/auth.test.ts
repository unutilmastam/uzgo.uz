import { describe, expect, it } from 'vitest';
import { otpVerifySchema, updateProfileSchema } from './auth.js';

describe('auth contracts', () => {
  it('requires a 6-digit code', () => {
    expect(otpVerifySchema.safeParse({ phone: '+998901234567', code: '12345' }).success).toBe(
      false,
    );
    expect(otpVerifySchema.safeParse({ phone: '+998901234567', code: '12a456' }).success).toBe(
      false,
    );
    expect(otpVerifySchema.safeParse({ phone: '+998901234567', code: '123456' }).success).toBe(
      true,
    );
  });

  it('rejects unknown fields (mass assignment)', () => {
    expect(
      otpVerifySchema.safeParse({ phone: '+998901234567', code: '123456', role: 'ADMIN' }).success,
    ).toBe(false);
    expect(updateProfileSchema.safeParse({ firstName: 'Ali', roles: ['ADMIN'] }).success).toBe(
      false,
    );
  });

  it('accepts Uzbek names with ʻ and ʼ and rejects markup', () => {
    expect(
      updateProfileSchema.safeParse({ firstName: 'Gʻayrat', lastName: 'Maʼrufov' }).success,
    ).toBe(true);
    expect(updateProfileSchema.safeParse({ firstName: '<script>' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });
});
