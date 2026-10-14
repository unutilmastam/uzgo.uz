import { randomInt } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SMS_PROVIDER } from '../src/sms/sms.provider.js';
import type { FakeSmsProvider } from '../src/sms/fake-sms.provider.js';

export const TEST_ORIGIN = 'http://localhost:3000';

/** Boots the real application (real PostgreSQL) with the production HTTP pipeline. */
export async function createTestApp(
  options: { prisma?: Partial<PrismaService>; env?: Record<string, string> } = {},
): Promise<NestExpressApplication> {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL or TEST_DATABASE_URL for integration tests');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: TEST_ORIGIN,
    BODY_LIMIT: '1kb',
    AUTH_SECRET: 'test-secret-'.padEnd(48, 'x'),
    SMS_PROVIDER: 'fake',
    OTP_IP_HOURLY_LIMIT: '10000',
    // Lets each test simulate its own client IP via X-Forwarded-For.
    TRUST_PROXY: '1',
    ...options.env,
  });

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.prisma) builder = builder.overrideProvider(PrismaService).useValue(options.prisma);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

/** A random, valid Uzbek mobile number. */
export function randomPhone(): string {
  return `+99890${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
}

export function randomIp(): string {
  return `10.${String(randomInt(0, 256))}.${String(randomInt(0, 256))}.${String(randomInt(1, 255))}`;
}

export function fakeSms(app: NestExpressApplication): FakeSmsProvider {
  return app.get<FakeSmsProvider>(SMS_PROVIDER);
}

/** Full OTP login; returns the session cookie ("name=value"). */
export async function login(
  app: NestExpressApplication,
  phone = randomPhone(),
): Promise<{ cookie: string; phone: string; userId: string }> {
  const ip = randomIp();
  await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .set('X-Forwarded-For', ip)
    .send({ phone })
    .expect(200);
  const code = fakeSms(app).lastCodeFor(phone);
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .set('X-Forwarded-For', ip)
    .send({ phone, code })
    .expect(200);
  const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = setCookie[0]?.split(';')[0];
  if (!cookie) throw new Error('No session cookie');
  return { cookie, phone, userId: (res.body as { user: { id: string } }).user.id };
}
