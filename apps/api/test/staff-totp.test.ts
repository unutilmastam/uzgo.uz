import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, totpSetupResponseSchema, totpStatusSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, timeStep, totpCode } from '../src/auth/totp.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, loginStaff, newSession, randomIp, TEST_ORIGIN } from './app.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('staff second factor (TOTP)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const post = (path: string, cookie: string, body?: object) =>
    http()
      .post(`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is only for staff', async () => {
    const customer = await login(app);
    await http().get('/api/v1/auth/totp/status').set('Cookie', customer.cookie).expect(403);
    await post('/auth/totp/setup', customer.cookie).expect(403);
  });

  it('blocks staff routes until the factor is enrolled and verified', async () => {
    const admin = await login(app);
    await prisma.userRole.create({ data: { userId: admin.userId, role: 'ADMIN' } });

    const blocked = await http()
      .get('/api/v1/admin/stores')
      .set('Cookie', admin.cookie)
      .expect(403);
    expect(errorCode(blocked.body)).toBe('TOTP_REQUIRED');

    const status = totpStatusSchema.parse(
      (await http().get('/api/v1/auth/totp/status').set('Cookie', admin.cookie).expect(200)).body,
    );
    expect(status).toEqual({ enabled: false, sessionVerified: false, required: true });

    // Verify before enrolment is refused; a wrong first code does not enable.
    await post('/auth/totp/verify', admin.cookie, { code: '123456' }).expect(409);
    const setup = totpSetupResponseSchema.parse(
      (await post('/auth/totp/setup', admin.cookie).expect(200)).body,
    );
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/UZGO%3A/);
    expect(setup.otpauthUri).not.toContain(admin.phone.slice(4));
    const secret = base32Decode(setup.secret);
    const wrong = totpCode(secret, timeStep() + 10);
    expect(
      errorCode((await post('/auth/totp/enable', admin.cookie, { code: wrong }).expect(400)).body),
    ).toBe('INVALID_CODE');

    // The secret is stored encrypted, never in plain text.
    const row = await prisma.staffTotp.findUniqueOrThrow({ where: { userId: admin.userId } });
    expect(row.secretEncrypted).not.toContain(setup.secret);

    await post('/auth/totp/enable', admin.cookie, { code: totpCode(secret, timeStep()) }).expect(
      204,
    );
    await http().get('/api/v1/admin/stores').set('Cookie', admin.cookie).expect(200);
    // Re-running setup on an enabled factor is refused (no silent secret swap).
    expect(errorCode((await post('/auth/totp/setup', admin.cookie).expect(409)).body)).toBe(
      'TOTP_ALREADY_ENABLED',
    );

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'auth.totp_enabled', entityId: admin.userId },
    });
    expect(audit).not.toBeNull();
  });

  it('requires a fresh verification in each new session and refuses replayed codes', async () => {
    const admin = await loginStaff(app, 'ADMIN');
    const secret = base32Decode(admin.secret);
    const second = { cookie: await newSession(app, admin.userId) };
    const blocked = await http()
      .get('/api/v1/admin/stores')
      .set('Cookie', second.cookie)
      .expect(403);
    expect(errorCode(blocked.body)).toBe('TOTP_REQUIRED');

    // The enrolment code was already used: replay refused.
    const { lastUsedStep } = await prisma.staffTotp.findUniqueOrThrow({
      where: { userId: admin.userId },
    });
    const usedStep = Number(lastUsedStep);
    await post('/auth/totp/verify', second.cookie, { code: totpCode(secret, usedStep) }).expect(
      400,
    );

    const next = totpCode(secret, usedStep + 1);
    await post('/auth/totp/verify', second.cookie, { code: next }).expect(204);
    await http().get('/api/v1/admin/stores').set('Cookie', second.cookie).expect(200);

    // The same code cannot verify yet another session.
    const third = { cookie: await newSession(app, admin.userId) };
    await post('/auth/totp/verify', third.cookie, { code: next }).expect(400);
  });

  it('locks after five wrong codes', async () => {
    const admin = await loginStaff(app, 'MODERATOR');
    const session = { cookie: await newSession(app, admin.userId) };
    const wrong = totpCode(base32Decode(admin.secret), timeStep() + 20);
    for (let i = 0; i < 5; i += 1) {
      await post('/auth/totp/verify', session.cookie, { code: wrong }).expect(400);
    }
    const good = totpCode(base32Decode(admin.secret), timeStep() + 1);
    const locked = await post('/auth/totp/verify', session.cookie, { code: good }).expect(429);
    expect(errorCode(locked.body)).toBe('TOTP_LOCKED');
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'auth.totp_locked', entityId: admin.userId },
    });
    expect(audit).not.toBeNull();
  });

  it('validates the code format', async () => {
    const admin = await loginStaff(app, 'ADMIN');
    await post('/auth/totp/verify', admin.cookie, { code: '12ab56' }).expect(400);
    await post('/auth/totp/verify', admin.cookie, { code: '123456', extra: 1 }).expect(400);
  });
});
