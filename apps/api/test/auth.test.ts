import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, currentUserResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, fakeSms, login, randomIp, randomPhone, TEST_ORIGIN } from './app.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('auth: OTP login, sessions, origin checks', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // Each call simulates its own client IP so per-IP throttling does not
  // interfere; throttling itself is tested separately below.
  const verify = (body: { phone: string; code: string | undefined }) =>
    http().post('/api/v1/auth/otp/verify').set('X-Forwarded-For', randomIp()).send(body);

  function requestCode(phone: string, ip = randomIp()) {
    return http().post('/api/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone });
  }

  describe('POST /auth/otp/request', () => {
    it('rejects invalid input', async () => {
      expect(errorCode((await requestCode('12345')).body)).toBe('VALIDATION_FAILED');
      expect(errorCode((await requestCode('+998 00 000 00 00')).body)).toBe('INVALID_PHONE');
      const extra = await http()
        .post('/api/v1/auth/otp/request')
        .send({ phone: randomPhone(), role: 'ADMIN' })
        .expect(400);
      expect(errorCode(extra.body)).toBe('VALIDATION_FAILED');
    });

    it('sends a code and stores only its hash', async () => {
      const phone = randomPhone();
      const res = await requestCode(phone).expect(200);
      expect(res.body).toEqual({ expiresInSeconds: 180, resendInSeconds: 60 });
      const code = fakeSms(app).lastCodeFor(phone);
      expect(code).toMatch(/^\d{6}$/);
      const row = await prisma.otpCode.findFirstOrThrow({ where: { phone } });
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.codeHash).not.toContain(code);
      expect(row.ipHash).not.toMatch(/^10\./);
    });

    it('accepts local formats and normalises to E.164', async () => {
      const phone = randomPhone();
      await requestCode(
        phone.replace('+998', '').replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2-$3-$4'),
      ).expect(200);
      expect(fakeSms(app).lastCodeFor(phone)).toBeDefined();
    });

    it('enforces the resend cooldown', async () => {
      const phone = randomPhone();
      await requestCode(phone).expect(200);
      const res = await requestCode(phone).expect(429);
      expect(errorCode(res.body)).toBe('OTP_RESEND_TOO_SOON');
    });

    it('enforces the hourly per-phone limit', async () => {
      const phone = randomPhone();
      const past = new Date(Date.now() - 5 * 60_000);
      await prisma.otpCode.createMany({
        data: Array.from({ length: 5 }, () => ({
          phone,
          codeHash: '0'.repeat(64),
          ipHash: 'x',
          expiresAt: past,
          createdAt: past,
        })),
      });
      const res = await requestCode(phone).expect(429);
      expect(errorCode(res.body)).toBe('OTP_LIMIT_REACHED');
    });

    it('serialises concurrent requests for the same phone', async () => {
      const phone = randomPhone();
      const results = await Promise.all([
        requestCode(phone),
        requestCode(phone),
        requestCode(phone),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await prisma.otpCode.count({ where: { phone } })).toBe(1);
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('logs in, creates a customer and sets a hardened session cookie', async () => {
      const phone = randomPhone();
      await requestCode(phone).expect(200);
      const code = fakeSms(app).lastCodeFor(phone);
      const res = await verify({ phone, code }).expect(200);

      const { user } = currentUserResponseSchema.parse(res.body);
      expect(user.phone).toBe(phone);
      expect(user.roles).toEqual(['CUSTOMER']);

      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '';
      expect(cookie).toMatch(/^uzgo_session=[A-Za-z0-9_-]{43};/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\//);

      const token = cookie.split(';')[0]?.split('=')[1] ?? '';
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.tokenHash).not.toBe(token);

      const actions = (await prisma.auditEvent.findMany({ where: { actorId: user.id } })).map(
        (e) => e.action,
      );
      expect(actions).toEqual(expect.arrayContaining(['user.created', 'auth.login']));
    });

    it('rejects a wrong code and a reused code with the same generic error', async () => {
      const phone = randomPhone();
      await requestCode(phone).expect(200);
      const code = fakeSms(app).lastCodeFor(phone) ?? '';
      const wrong = code === '000000' ? '111111' : '000000';
      const res = await verify({ phone, code: wrong }).expect(400);
      expect(errorCode(res.body)).toBe('INVALID_CODE');

      await verify({ phone, code }).expect(200);
      const reused = await verify({ phone, code }).expect(400);
      expect(errorCode(reused.body)).toBe('INVALID_CODE');
    });

    it('locks the code after 5 wrong attempts', async () => {
      const phone = randomPhone();
      await requestCode(phone).expect(200);
      const code = fakeSms(app).lastCodeFor(phone) ?? '';
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await verify({ phone, code: wrong }).expect(400);
      }
      const res = await verify({ phone, code }).expect(400);
      expect(errorCode(res.body)).toBe('INVALID_CODE');
      const otp = await prisma.otpCode.findFirstOrThrow({ where: { phone } });
      expect(otp.attempts).toBe(5);
      expect(
        await prisma.auditEvent.count({ where: { action: 'auth.otp_locked', entityId: otp.id } }),
      ).toBe(1);
    });

    it('rejects an expired code', async () => {
      const phone = randomPhone();
      await requestCode(phone).expect(200);
      const code = fakeSms(app).lastCodeFor(phone);
      await prisma.otpCode.updateMany({
        where: { phone },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await verify({ phone, code }).expect(400);
      expect(errorCode(res.body)).toBe('INVALID_CODE');
    });

    it('lets only one of two concurrent verifications succeed', async () => {
      const phone = randomPhone();
      await requestCode(phone).expect(200);
      const code = fakeSms(app).lastCodeFor(phone);
      const results = await Promise.all([verify({ phone, code }), verify({ phone, code })]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    });

    it('refuses blocked accounts and invalidates their sessions', async () => {
      const { cookie, phone, userId } = await login(app);
      await prisma.user.update({ where: { id: userId }, data: { status: 'BLOCKED' } });
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);

      await prisma.otpCode.updateMany({ where: { phone }, data: { createdAt: new Date(0) } });
      await requestCode(phone).expect(200);
      const code = fakeSms(app).lastCodeFor(phone);
      const res = await verify({ phone, code }).expect(403);
      expect(errorCode(res.body)).toBe('ACCOUNT_BLOCKED');
    });
  });

  describe('sessions', () => {
    it('requires authentication for /auth/me', async () => {
      const res = await http().get('/api/v1/auth/me').expect(401);
      expect(errorCode(res.body)).toBe('UNAUTHENTICATED');
      await http()
        .get('/api/v1/auth/me')
        .set('Cookie', 'uzgo_session=forged-token-value-that-is-long-enough-xx')
        .expect(401);
    });

    it('returns the current user for a valid session', async () => {
      const { cookie, phone } = await login(app);
      const res = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      expect(currentUserResponseSchema.parse(res.body).user.phone).toBe(phone);
    });

    it('rejects expired sessions', async () => {
      const { cookie, userId } = await login(app);
      await prisma.session.updateMany({
        where: { userId },
        data: { createdAt: new Date(Date.now() - 2000), expiresAt: new Date(Date.now() - 1000) },
      });
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    });

    it('logout revokes the current session only', async () => {
      const { cookie, phone } = await login(app);
      await prisma.otpCode.updateMany({ where: { phone }, data: { createdAt: new Date(0) } });
      const second = await login(app, phone);

      await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .expect(204);
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Cookie', second.cookie).expect(200);
    });

    it('logout-all revokes every session of the user', async () => {
      const { cookie, phone } = await login(app);
      await prisma.otpCode.updateMany({ where: { phone }, data: { createdAt: new Date(0) } });
      const second = await login(app, phone);

      await http()
        .post('/api/v1/auth/logout-all')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .expect(204);
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
      await http().get('/api/v1/auth/me').set('Cookie', second.cookie).expect(401);
    });
  });

  describe('origin checks (CSRF defence)', () => {
    it('rejects state-changing requests from foreign origins', async () => {
      const { cookie } = await login(app);
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
      expect(errorCode(res.body)).toBe('ORIGIN_NOT_ALLOWED');
      await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    });

    it('requires an origin when cookies are present', async () => {
      const { cookie } = await login(app);
      const res = await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(403);
      expect(errorCode(res.body)).toBe('ORIGIN_REQUIRED');
      await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .set('Referer', `${TEST_ORIGIN}/uz/account`)
        .expect(204);
    });
  });

  it('keeps the audit log append-only at the database level', async () => {
    const event = await prisma.auditEvent.findFirstOrThrow();
    await expect(
      prisma.auditEvent.update({ where: { id: event.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /append-only/,
    );
  });
});

describe('auth: abuse limits', () => {
  it('limits OTP requests per IP per hour', async () => {
    const app = await createTestApp({ env: { OTP_IP_HOURLY_LIMIT: '2' } });
    const ip = randomIp();
    const send = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .set('X-Forwarded-For', ip)
        .send({ phone: randomPhone() });
    await send().expect(200);
    await send().expect(200);
    const res = await send().expect(429);
    expect(errorCode(res.body)).toBe('OTP_LIMIT_REACHED');
    await app.close();
  });

  it('rate-limits the OTP endpoint per IP (burst protection)', async () => {
    const app = await createTestApp();
    const ip = randomIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .set('X-Forwarded-For', ip)
        .send({ phone: randomPhone() });
      statuses.push(res.status);
      if (res.status === 429) expect(errorCode(res.body)).toBe('RATE_LIMITED');
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
    await app.close();
  });
});
