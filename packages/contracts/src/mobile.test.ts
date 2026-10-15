import { describe, expect, it } from 'vitest';
import { pushDataSchema, registerPushDeviceSchema } from './mobile.js';

describe('mobile contracts', () => {
  it('accepts Expo push tokens only', () => {
    const ok = { token: 'ExponentPushToken[abcdefghij0123456789]', platform: 'ANDROID' };
    expect(registerPushDeviceSchema.safeParse(ok).success).toBe(true);
    expect(registerPushDeviceSchema.safeParse({ ...ok, token: 'https://evil' }).success).toBe(
      false,
    );
    expect(registerPushDeviceSchema.safeParse({ ...ok, userId: 'x' }).success).toBe(false);
  });

  it('parses deep-link payloads', () => {
    expect(pushDataSchema.parse({ type: 'order', number: 'UZ-2026-000001' }).type).toBe('order');
    expect(pushDataSchema.safeParse({ type: 'admin' }).success).toBe(false);
  });
});
