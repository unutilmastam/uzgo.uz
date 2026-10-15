import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminCategoriesResponseSchema,
  adminOrderListResponseSchema,
  adminProductListResponseSchema,
  adminUserListResponseSchema,
  apiErrorSchema,
  auditListResponseSchema,
  orderResponseSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('admin back office', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let moderator: Awaited<ReturnType<typeof loginStaff>>;
  let admin: Awaited<ReturnType<typeof loginStaff>>;
  let superAdmin: Awaited<ReturnType<typeof loginStaff>>;
  const http = () => request(app.getHttpServer());
  const get = (path: string, cookie: string) => http().get(`/api/v1${path}`).set('Cookie', cookie);
  const send = (method: 'post' | 'patch' | 'put', path: string, cookie: string, body?: object) => {
    const server = http();
    return server[method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    moderator = await loginStaff(app, 'MODERATOR');
    admin = await loginStaff(app, 'ADMIN');
    superAdmin = await loginStaff(app, 'SUPER_ADMIN');
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  describe('permission boundaries', () => {
    const adminOnly = [
      '/admin/categories',
      '/admin/attributes',
      '/admin/users',
      '/admin/orders',
      '/admin/audit',
    ];

    it('closes every staff route to customers and sellers', async () => {
      const customer = await login(app);
      const seller = await login(app);
      await createStore(prisma, { ownerId: seller.userId });
      await prisma.userRole.create({ data: { userId: seller.userId, role: 'SELLER_OWNER' } });
      for (const path of [...adminOnly, '/admin/products', '/admin/stores']) {
        await get(path, customer.cookie).expect(403);
        await get(path, seller.cookie).expect(403);
        await http().get(`/api/v1${path}`).expect(401);
      }
    });

    it('lets moderators moderate but not administer', async () => {
      await get('/admin/products', moderator.cookie).expect(200);
      for (const path of adminOnly) await get(path, moderator.cookie).expect(403);
    });

    it('requires the second factor for admins too', async () => {
      const fresh = await login(app);
      await prisma.userRole.create({ data: { userId: fresh.userId, role: 'ADMIN' } });
      for (const path of adminOnly) {
        const res = await get(path, fresh.cookie).expect(403);
        expect(errorCode(res.body)).toBe('TOTP_REQUIRED');
      }
    });
  });

  describe('product moderation', () => {
    it('approves a submitted product, which then appears on the storefront', async () => {
      const store = await createStore(prisma);
      const product = await createProduct(prisma, { storeId: store.id, status: 'PENDING_REVIEW' });
      await prisma.product.update({ where: { id: product.id }, data: { submittedAt: new Date() } });
      await http().get(`/api/v1/catalog/products/${product.slug}`).expect(404);

      const queue = adminProductListResponseSchema.parse(
        (await get('/admin/products?status=PENDING_REVIEW', moderator.cookie).expect(200)).body,
      );
      expect(queue.items.every((p) => p.status === 'PENDING_REVIEW')).toBe(true);

      await send('post', `/admin/products/${product.id}/approve`, moderator.cookie).expect(200);
      await http().get(`/api/v1/catalog/products/${product.slug}`).expect(200);
      const again = await send(
        'post',
        `/admin/products/${product.id}/approve`,
        moderator.cookie,
      ).expect(409);
      expect(errorCode(again.body)).toBe('INVALID_TRANSITION');

      // Take-down of a live product, with a reason the seller sees.
      await send('post', `/admin/products/${product.id}/reject`, moderator.cookie, {}).expect(400);
      const taken = await send('post', `/admin/products/${product.id}/reject`, moderator.cookie, {
        reason: 'Soxta brend',
      }).expect(200);
      expect(
        (taken.body as { product: { status: string; moderationNote: string } }).product,
      ).toMatchObject({
        status: 'REJECTED',
        moderationNote: 'Soxta brend',
      });
      await http().get(`/api/v1/catalog/products/${product.slug}`).expect(404);

      const actions = (
        await prisma.auditEvent.findMany({
          where: { entityId: product.id },
          orderBy: { id: 'asc' },
        })
      ).map((e) => [e.action, e.actorId]);
      expect(actions).toEqual([
        ['product.approved', moderator.userId],
        ['product.rejected', moderator.userId],
      ]);
    });

    it('does not approve products of an inactive store or drafts', async () => {
      const store = await createStore(prisma, { status: 'SUSPENDED' });
      const product = await createProduct(prisma, { storeId: store.id, status: 'PENDING_REVIEW' });
      const res = await send(
        'post',
        `/admin/products/${product.id}/approve`,
        moderator.cookie,
      ).expect(409);
      expect(errorCode(res.body)).toBe('STORE_NOT_ACTIVE');

      const active = await createStore(prisma);
      const draft = await createProduct(prisma, { storeId: active.id, status: 'DRAFT' });
      await send('post', `/admin/products/${draft.id}/approve`, moderator.cookie).expect(409);
      await send('post', `/admin/products/${randomUUID()}/approve`, moderator.cookie).expect(400);
    });
  });

  describe('categories and attributes', () => {
    it('creates categories, refuses cycles and duplicate slugs, and sets filters', async () => {
      const slug = `test-cat-${randomUUID().slice(0, 8)}`;
      const parent = (
        await send('post', '/admin/categories', admin.cookie, {
          slug,
          name: { uz: 'Sinov', ru: 'Тест' },
          active: false,
        }).expect(201)
      ).body as { category: { id: string } };
      const child = (
        await send('post', '/admin/categories', admin.cookie, {
          slug: `${slug}-child`,
          parentId: parent.category.id,
          name: { uz: 'Bola', ru: 'Дочерняя' },
          active: false,
        }).expect(201)
      ).body as { category: { id: string } };

      const dup = await send('post', '/admin/categories', admin.cookie, {
        slug,
        name: { uz: 'X', ru: 'X' },
      }).expect(409);
      expect(errorCode(dup.body)).toBe('SLUG_TAKEN');
      const cycle = await send('patch', `/admin/categories/${parent.category.id}`, admin.cookie, {
        parentId: child.category.id,
      }).expect(400);
      expect(errorCode(cycle.body)).toBe('CATEGORY_CYCLE');
      await send('patch', `/admin/categories/${parent.category.id}`, admin.cookie, {
        parentId: parent.category.id,
      }).expect(400);

      // A category that already holds products cannot become a parent.
      const smartphones = await prisma.category.findUniqueOrThrow({
        where: { slug: 'smartphones' },
      });
      const store = await createStore(prisma);
      await createProduct(prisma, { storeId: store.id });
      const blocked = await send('post', '/admin/categories', admin.cookie, {
        slug: `${slug}-x`,
        parentId: smartphones.id,
        name: { uz: 'X', ru: 'X' },
      }).expect(409);
      expect(errorCode(blocked.body)).toBe('PARENT_HAS_PRODUCTS');

      const color = await prisma.attribute.findUniqueOrThrow({ where: { code: 'color' } });
      await send('put', `/admin/categories/${child.category.id}/attributes`, admin.cookie, {
        attributeIds: [color.id],
      }).expect(200);
      const list = adminCategoriesResponseSchema.parse(
        (await get('/admin/categories', admin.cookie).expect(200)).body,
      );
      expect(list.items.find((c) => c.id === child.category.id)?.attributeIds).toEqual([color.id]);
      // Inactive categories stay out of the public tree.
      const tree = JSON.stringify(
        (await http().get('/api/v1/catalog/categories').expect(200)).body,
      );
      expect(tree).not.toContain(slug);
    });

    it('renames feed the search index', async () => {
      const store = await createStore(prisma);
      const category = await prisma.category.create({
        data: {
          slug: `test-cat-${randomUUID().slice(0, 8)}`,
          name: { uz: 'Eski', ru: 'Старое' },
          // Inactive: test data never shows up in the public category tree.
          active: false,
        },
      });
      const product = await createProduct(prisma, {
        storeId: store.id,
        categorySlug: category.slug,
      });
      await send('patch', `/admin/categories/${category.id}`, admin.cookie, {
        name: { uz: 'Gʻaroyibnomlar', ru: 'Чудеса' },
      }).expect(200);
      const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(row.searchText).toContain('garoyibnomlar');
    });

    it('manages attribute values with unique codes', async () => {
      const code = `t${randomUUID().slice(0, 6)}`;
      const created = (
        await send('post', '/admin/attributes', admin.cookie, {
          code,
          name: { uz: 'Material', ru: 'Материал' },
        }).expect(201)
      ).body as { attribute: { id: string } };
      const path = `/admin/attributes/${created.attribute.id}/values`;
      await send('post', path, admin.cookie, {
        code: 'paxta',
        name: { uz: 'Paxta', ru: 'Хлопок' },
      }).expect(201);
      const dup = await send('post', path, admin.cookie, {
        code: 'paxta',
        name: { uz: 'P', ru: 'P' },
      }).expect(409);
      expect(errorCode(dup.body)).toBe('CODE_TAKEN');
      await send('post', '/admin/attributes', admin.cookie, {
        code: 'Bad Code',
        name: { uz: 'x', ru: 'x' },
      }).expect(400);
    });
  });

  describe('users', () => {
    it('finds users by phone and blocks them everywhere', async () => {
      const target = await login(app);
      const found = adminUserListResponseSchema.parse(
        (await get(`/admin/users?phone=${target.phone.slice(1)}`, admin.cookie).expect(200)).body,
      );
      expect(found.items.map((u) => u.id)).toEqual([target.userId]);

      await send('post', `/admin/users/${target.userId}/block`, admin.cookie).expect(200);
      await http().get('/api/v1/auth/me').set('Cookie', target.cookie).expect(401);
      await send('post', `/admin/users/${target.userId}/unblock`, admin.cookie).expect(200);
      const actions = (
        await prisma.auditEvent.findMany({
          where: { entityId: target.userId },
          orderBy: { id: 'asc' },
        })
      ).map((e) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['user.blocked', 'user.unblocked']));
    });

    it('protects staff accounts: only a super admin blocks staff or resets their factor', async () => {
      const otherAdmin = await loginStaff(app, 'ADMIN');
      await send('post', `/admin/users/${otherAdmin.userId}/block`, admin.cookie).expect(403);
      await send('post', `/admin/users/${admin.userId}/block`, admin.cookie).expect(403);
      await send('post', `/admin/users/${moderator.userId}/totp-reset`, admin.cookie).expect(403);

      const res = await send(
        'post',
        `/admin/users/${otherAdmin.userId}/totp-reset`,
        superAdmin.cookie,
      ).expect(200);
      expect((res.body as { user: { totpEnabled: boolean } }).user.totpEnabled).toBe(false);
      // The reset signs the account out; its next session must enrol again.
      await get('/admin/users', otherAdmin.cookie).expect(401);
      expect(
        await prisma.auditEvent.findFirst({
          where: { action: 'auth.totp_reset', entityId: otherAdmin.userId },
        }),
      ).not.toBeNull();
    });
  });

  describe('orders and audit', () => {
    it('lists orders and moves shipments through the state machine', async () => {
      const store = await createStore(prisma);
      const product = await createProduct(prisma, {
        storeId: store.id,
        variants: [{ priceTiyin: 50_000_00n, stock: 3 }],
      });
      const customer = await login(app);
      await send('post', '/cart/items', customer.cookie, {
        variantId: product.variants[0]?.id,
        quantity: 1,
      }).expect(201);
      const district = await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } });
      const checkout = await http()
        .post('/api/v1/checkout')
        .set('Cookie', customer.cookie)
        .set('Origin', TEST_ORIGIN)
        .set('Idempotency-Key', randomUUID())
        .send({
          recipientName: 'Ali Valiyev',
          recipientPhone: '+998901234567',
          districtId: district.id,
          addressLine: 'Alpomish koʻchasi, 1',
          paymentMethod: 'CASH_ON_DELIVERY',
          expectedTotalTiyin: '5000000',
        })
        .expect(201);
      const { order } = orderResponseSchema.parse(checkout.body);

      const list = adminOrderListResponseSchema.parse(
        (await get(`/admin/orders?number=${order.number}`, admin.cookie).expect(200)).body,
      );
      expect(list.items).toEqual([
        expect.objectContaining({ number: order.number, storeCount: 1 }),
      ]);
      await get('/admin/orders/not-a-number', admin.cookie).expect(400);
      await get('/admin/orders/UZ-1999-000001', admin.cookie).expect(404);

      const shipment = order.sellerOrders[0]?.id ?? '';
      const path = `/admin/orders/${order.number}/seller-orders/${shipment}/transition`;
      const moved = orderResponseSchema.parse(
        (await send('post', path, admin.cookie, { to: 'ACCEPTED' }).expect(200)).body,
      );
      expect(moved.order.sellerOrders[0]?.status).toBe('ACCEPTED');
      // The state machine still applies to staff: no jump straight to DELIVERED.
      await send('post', path, admin.cookie, { to: 'DELIVERED' }).expect(409);
      await send('post', path, moderator.cookie, { to: 'PACKED' }).expect(403);

      // Admins no longer act through the seller route (no TOTP there): non-members get 404.
      await send('post', `/seller/seller-orders/${shipment}/transition`, admin.cookie, {
        to: 'PACKED',
      }).expect(404);
    });

    it('shows the audit log newest first with masked phones and cursor paging', async () => {
      const first = auditListResponseSchema.parse(
        (await get('/admin/audit?action=auth.', admin.cookie).expect(200)).body,
      );
      expect(first.items.length).toBeGreaterThan(0);
      expect(first.items.every((e) => e.action.startsWith('auth.'))).toBe(true);
      const ids = first.items.map((e) => e.id);
      expect([...ids].sort().reverse()).toEqual(ids);
      for (const event of first.items) {
        if (event.actor) expect(event.actor.phone).toMatch(/\*/);
      }
      expect(JSON.stringify(first)).not.toContain('ipHash');
      const cursor = first.nextBefore;
      if (cursor) {
        const next = auditListResponseSchema.parse(
          (await get(`/admin/audit?action=auth.&before=${cursor}`, admin.cookie).expect(200)).body,
        );
        expect(next.items.every((e) => e.id < cursor)).toBe(true);
      }
      await get('/admin/audit?action=DROP%20TABLE', admin.cookie).expect(400);
    });
  });
});
