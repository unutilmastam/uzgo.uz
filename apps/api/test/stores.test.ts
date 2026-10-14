import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminStoreListResponseSchema,
  apiErrorSchema,
  currentUserResponseSchema,
  sellerStoresResponseSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';
import { retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('seller onboarding and store review', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let districtId: string;
  const http = () => request(app.getHttpServer());
  const post = (path: string, cookie: string, body?: object) =>
    http()
      .post(`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  const application = (overrides: Record<string, unknown> = {}) => ({
    name: { uz: 'Yangi doʻkon', ru: 'Новый магазин' },
    slug: `test-store-${randomUUID().slice(0, 8)}`,
    districtId,
    legalType: 'INDIVIDUAL_ENTREPRENEUR',
    legalName: 'YaTT Aliyev Ali',
    taxId: '123456789',
    contactPhone: '90 123 45 67',
    ...overrides,
  });
  const apply = async (cookie: string) => {
    const res = await post('/seller/stores', cookie, application()).expect(201);
    return (res.body as { store: { id: string; slug: string } }).store;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    districtId = (await prisma.district.findFirstOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  describe('POST /seller/stores (apply)', () => {
    it('requires a session', async () => {
      await http().post('/api/v1/seller/stores').send(application()).expect(401);
    });

    it('creates a pending store owned by the applicant, normalising the phone', async () => {
      const user = await login(app);
      const store = await apply(user.cookie);
      const row = await prisma.store.findUniqueOrThrow({
        where: { id: store.id },
        include: { members: true },
      });
      expect(row.status).toBe('PENDING');
      expect(row.contactPhone).toBe('+998901234567');
      expect(row.members).toEqual([
        expect.objectContaining({ userId: user.userId, role: 'OWNER' }),
      ]);

      const mine = sellerStoresResponseSchema.parse(
        (await http().get('/api/v1/seller/stores').set('Cookie', user.cookie).expect(200)).body,
      );
      expect(mine.items.map((s) => [s.id, s.status, s.myRole])).toEqual([
        [store.id, 'PENDING', 'OWNER'],
      ]);

      // A pending store is not on the storefront and the applicant is not a seller yet.
      await http().get(`/api/v1/catalog/stores/${store.slug}`).expect(404);
      const me = currentUserResponseSchema.parse(
        (await http().get('/api/v1/auth/me').set('Cookie', user.cookie).expect(200)).body,
      );
      expect(me.user.roles).not.toContain('SELLER_OWNER');
      expect(
        await prisma.auditEvent.findFirst({
          where: { action: 'store.applied', entityId: store.id },
        }),
      ).not.toBeNull();
    });

    it('allows one pending application at a time and rejects taken slugs', async () => {
      const user = await login(app);
      const first = await apply(user.cookie);
      const again = await post('/seller/stores', user.cookie, application()).expect(409);
      expect(errorCode(again.body)).toBe('APPLICATION_PENDING');

      const other = await login(app);
      const taken = await post(
        '/seller/stores',
        other.cookie,
        application({ slug: first.slug }),
      ).expect(409);
      expect(errorCode(taken.body)).toBe('SLUG_TAKEN');
    });

    it('validates the application and refuses mass assignment', async () => {
      const user = await login(app);
      const cases = [
        { taxId: '12345' },
        { slug: 'Bad Slug' },
        { contactPhone: '12' },
        { legalType: 'GOVERNMENT' },
        { districtId: 'not-a-uuid' },
        { status: 'ACTIVE' },
        { isDemo: true },
      ];
      for (const overrides of cases) {
        await post('/seller/stores', user.cookie, application(overrides)).expect(400);
      }
      await post(
        '/seller/stores',
        user.cookie,
        application({ districtId: '01890000-0000-7000-8000-000000000000' }),
      ).expect(400);
      expect(await prisma.storeMember.count({ where: { userId: user.userId } })).toBe(0);
    });
  });

  describe('admin review', () => {
    it('is closed to customers and sellers', async () => {
      const user = await login(app);
      const store = await apply(user.cookie);
      await http().get('/api/v1/admin/stores').set('Cookie', user.cookie).expect(403);
      await post(`/admin/stores/${store.id}/approve`, user.cookie).expect(403);
      expect((await prisma.store.findUniqueOrThrow({ where: { id: store.id } })).status).toBe(
        'PENDING',
      );
    });

    it('lets a moderator approve an application; the owner becomes a seller', async () => {
      const moderator = await loginStaff(app, 'MODERATOR');
      const user = await login(app);
      const store = await apply(user.cookie);

      const queue = adminStoreListResponseSchema.parse(
        (
          await http()
            .get('/api/v1/admin/stores?status=PENDING&page=1')
            .set('Cookie', moderator.cookie)
            .expect(200)
        ).body,
      );
      expect(queue.items.every((s) => s.status === 'PENDING')).toBe(true);
      expect(queue.total).toBeGreaterThan(0);

      const res = await post(`/admin/stores/${store.id}/approve`, moderator.cookie).expect(200);
      expect((res.body as { store: { status: string } }).store.status).toBe('ACTIVE');
      const me = currentUserResponseSchema.parse(
        (await http().get('/api/v1/auth/me').set('Cookie', user.cookie).expect(200)).body,
      );
      expect(me.user.roles).toContain('SELLER_OWNER');

      // A decision is final for that status: approving twice is a conflict.
      const twice = await post(`/admin/stores/${store.id}/approve`, moderator.cookie).expect(409);
      expect(errorCode(twice.body)).toBe('INVALID_TRANSITION');
      // Suspending a live store is an admin decision, not a moderator one.
      await post(`/admin/stores/${store.id}/suspend`, moderator.cookie, {
        reason: 'Shikoyatlar',
      }).expect(403);

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { action: 'store.approved', entityId: store.id },
      });
      expect(event.actorId).toBe(moderator.userId);
    });

    it('rejects with a reason the seller can see, and allows a new application', async () => {
      const moderator = await loginStaff(app, 'MODERATOR');
      const user = await login(app);
      const store = await apply(user.cookie);
      await post(`/admin/stores/${store.id}/reject`, moderator.cookie, {}).expect(400);
      await post(`/admin/stores/${store.id}/reject`, moderator.cookie, {
        reason: 'STIR notoʻgʻri',
      }).expect(200);
      const mine = sellerStoresResponseSchema.parse(
        (await http().get('/api/v1/seller/stores').set('Cookie', user.cookie).expect(200)).body,
      );
      expect(mine.items[0]).toMatchObject({ status: 'REJECTED', reviewNote: 'STIR notoʻgʻri' });
      await apply(user.cookie);
    });

    it('lets an admin suspend and reactivate a live store', async () => {
      const admin = await loginStaff(app, 'ADMIN');
      const user = await login(app);
      const store = await apply(user.cookie);
      await post(`/admin/stores/${store.id}/reactivate`, admin.cookie).expect(409);
      await post(`/admin/stores/${store.id}/approve`, admin.cookie).expect(200);
      await http().get(`/api/v1/catalog/stores/${store.slug}`).expect(200);
      await post(`/admin/stores/${store.id}/suspend`, admin.cookie, {
        reason: 'Shikoyatlar',
      }).expect(200);
      await http().get(`/api/v1/catalog/stores/${store.slug}`).expect(404);
      await post(`/admin/stores/${store.id}/reactivate`, admin.cookie).expect(200);
      const actions = (
        await prisma.auditEvent.findMany({ where: { entityId: store.id }, orderBy: { id: 'asc' } })
      ).map((e) => e.action);
      expect(actions).toEqual([
        'store.applied',
        'store.approved',
        'store.suspended',
        'store.reactivated',
      ]);
    });

    it('caps a seller at three stores', async () => {
      const admin = await loginStaff(app, 'ADMIN');
      const user = await login(app);
      for (let i = 0; i < 3; i += 1) {
        const store = await apply(user.cookie);
        await post(`/admin/stores/${store.id}/approve`, admin.cookie).expect(200);
      }
      const res = await post('/seller/stores', user.cookie, application()).expect(409);
      expect(errorCode(res.body)).toBe('STORE_LIMIT');
    });

    it('returns 404 for unknown stores and 400 for bad ids', async () => {
      const admin = await loginStaff(app, 'ADMIN');
      await post('/admin/stores/01890000-0000-7000-8000-000000000000/approve', admin.cookie).expect(
        404,
      );
      await post('/admin/stores/nope/approve', admin.cookie).expect(400);
      await http()
        .get('/api/v1/admin/stores?status=WHATEVER')
        .set('Cookie', admin.cookie)
        .expect(400);
    });
  });
});
