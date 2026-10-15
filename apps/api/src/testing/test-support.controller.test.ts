import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/http-exception.filter.js';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { FakeSmsProvider } from '../sms/fake-sms.provider.js';
import type { SmsProvider } from '../sms/sms.provider.js';
import { TestSupportController } from './test-support.controller.js';

function controller(env: Partial<Env>, sms: SmsProvider) {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1' }) },
    userRole: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    prisma,
    controller: new TestSupportController(env as Env, sms, prisma as unknown as PrismaService),
  };
}

describe('test support routes', () => {
  const sms = new FakeSmsProvider();

  it('refuse everything outside NODE_ENV=test with the fake SMS provider', async () => {
    for (const env of [
      { NODE_ENV: 'production', SMS_PROVIDER: 'fake' },
      { NODE_ENV: 'development', SMS_PROVIDER: 'fake' },
      { NODE_ENV: 'test', SMS_PROVIDER: 'dev' },
    ] as Partial<Env>[]) {
      const { controller: c, prisma } = controller(env, sms);
      await expect(c.grantRole({ phone: '+998901234567', role: 'ADMIN' })).rejects.toBeInstanceOf(
        AppException,
      );
      expect(() => c.lastOtp('+998901234567')).toThrow();
      expect(prisma.userRole.createMany).not.toHaveBeenCalled();
    }
  });

  it('grants only staff roles, in test mode', async () => {
    const { controller: c, prisma } = controller({ NODE_ENV: 'test', SMS_PROVIDER: 'fake' }, sms);
    await expect(c.grantRole({ phone: '+998901234567', role: 'CUSTOMER' })).rejects.toBeDefined();
    await c.grantRole({ phone: '+998901234567', role: 'MODERATOR' });
    expect(prisma.userRole.createMany).toHaveBeenCalledTimes(1);
  });
});
