import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminReviewListSchema,
  apiErrorSchema,
  myReviewResponseSchema,
  orderResponseSchema,
  productDetailResponseSchema,
  productReviewsResponseSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { authorName } from '../src/reviews/reviews.service.js';
import { createTestApp, login, loginStaff, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('product reviews and ratings', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let moderator: Awaited<ReturnType<typeof loginStaff>>;
  let districtId = '';
  const http = () => request(app.getHttpServer());
  const send = (method: 'post' | 'put' | 'delete', path: string, cookie: string, body?: object) => {
    const server = http();
    return server[method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  };

  async function shop() {
    const owner = await login(app);
    const store = await createStore(prisma, { ownerId: owner.userId });
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 20 }],
    });
    return { owner, slug: product.slug, variantId: product.variants[0]?.id ?? '' };
  }

  /** A customer who bought the product; the shipment is delivered when `deliver` is set. */
  async function buyer(s: Awaited<ReturnType<typeof shop>>, deliver: boolean, firstName?: string) {
    const customer = await login(app);
    if (firstName) {
      await prisma.userProfile.upsert({
        where: { userId: customer.userId },
        create: { userId: customer.userId, firstName, lastName: 'valiyev' },
        update: { firstName, lastName: 'valiyev' },
      });
    }
    await send('post', '/cart/items', customer.cookie, {
      variantId: s.variantId,
      quantity: 1,
    }).expect(201);
    const res = await http()
      .post('/api/v1/checkout')
      .set('Cookie', customer.cookie)
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        districtId,
        addressLine: 'Alpomish koʻchasi, 1',
        paymentMethod: 'CASH_ON_DELIVERY',
        expectedTotalTiyin: '100000',
      })
      .expect(201);
    const shipmentId = orderResponseSchema.parse(res.body).order.sellerOrders[0]?.id ?? '';
    if (deliver) {
      for (const to of ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED']) {
        await send('post', `/seller/seller-orders/${shipmentId}/transition`, s.owner.cookie, {
          to,
        }).expect(204);
      }
    }
    return customer;
  }

  const rating = async (slug: string) =>
    productDetailResponseSchema.parse(
      (await http().get(`/api/v1/catalog/products/${slug}`).expect(200)).body,
    ).product.rating;

  const aggregates = (slug: string) =>
    prisma.product.findUniqueOrThrow({
      where: { slug },
      select: { ratingSum: true, ratingCount: true },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    moderator = await loginStaff(app, 'MODERATOR');
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('formats author names without surnames', () => {
    expect(authorName({ firstName: 'Ali', lastName: 'valiyev' })).toBe('Ali V.');
    expect(authorName({ firstName: ' Ali ', lastName: null })).toBe('Ali');
    expect(authorName({ firstName: null, lastName: 'Valiyev' })).toBeNull();
    expect(authorName(null)).toBeNull();
  });

  it('lets only customers who received the product review it', async () => {
    const s = await shop();
    const path = `/products/${s.slug}/reviews/mine`;

    const stranger = await login(app);
    const none = await http().get(`/api/v1${path}`).set('Cookie', stranger.cookie).expect(200);
    expect(myReviewResponseSchema.parse(none.body)).toEqual({ canReview: false, review: null });
    const denied = await send('put', path, stranger.cookie, { rating: 5 }).expect(403);
    expect(errorCode(denied.body)).toBe('REVIEW_NOT_ALLOWED');

    // Ordered but not yet delivered: still not allowed.
    const waiting = await buyer(s, false);
    await send('put', path, waiting.cookie, { rating: 5 }).expect(403);

    // Anonymous visitors cannot write.
    await http().put(`/api/v1${path}`).set('Origin', TEST_ORIGIN).send({ rating: 5 }).expect(401);

    const customer = await buyer(s, true, 'Ali');
    const mine = myReviewResponseSchema.parse(
      (await http().get(`/api/v1${path}`).set('Cookie', customer.cookie).expect(200)).body,
    );
    expect(mine).toEqual({ canReview: true, review: null });

    // Validation: rating 1..5, no links.
    await send('put', path, customer.cookie, { rating: 6 }).expect(400);
    await send('put', path, customer.cookie, { rating: 4, text: 'see https://spam.uz' }).expect(
      400,
    );
    await send('put', path, customer.cookie, { rating: 4, text: 'x'.repeat(1001) }).expect(400);

    const saved = myReviewResponseSchema.parse(
      (
        await send('put', path, customer.cookie, { rating: 4, text: '  Yaxshi mahsulot  ' }).expect(
          200,
        )
      ).body,
    );
    expect(saved.review).toMatchObject({
      rating: 4,
      text: 'Yaxshi mahsulot',
      authorName: 'Ali V.',
      hidden: false,
    });
    expect(await rating(s.slug)).toEqual({ average: 4, count: 1 });
  });

  it('keeps the product rating in step with edits, deletes and moderation', async () => {
    const s = await shop();
    const path = `/products/${s.slug}/reviews/mine`;
    const a = await buyer(s, true, 'Aziz');
    const b = await buyer(s, true);
    expect(await rating(s.slug)).toBeNull();

    await send('put', path, a.cookie, { rating: 5 }).expect(200);
    await send('put', path, b.cookie, { rating: 2, text: 'Oʻrtacha' }).expect(200);
    expect(await rating(s.slug)).toEqual({ average: 3.5, count: 2 });

    // One review per customer: a second PUT edits it.
    await send('put', path, a.cookie, { rating: 4 }).expect(200);
    expect(await aggregates(s.slug)).toEqual({ ratingSum: 6, ratingCount: 2 });
    expect(await prisma.productReview.count({ where: { product: { slug: s.slug } } })).toBe(2);

    const list = productReviewsResponseSchema.parse(
      (await http().get(`/api/v1/catalog/products/${s.slug}/reviews`).expect(200)).body,
    );
    expect(list.total).toBe(2);
    expect(list.distribution).toEqual([0, 1, 0, 1, 0]);
    expect(list.items[0]).toMatchObject({ rating: 2, text: 'Oʻrtacha', authorName: null });
    expect(JSON.stringify(list)).not.toContain(b.phone.slice(-7));

    // The moderator hides b's review: it leaves the list and the average.
    const reviewB = await prisma.productReview.findFirstOrThrow({ where: { userId: b.userId } });
    await send('post', `/admin/reviews/${reviewB.id}/hide`, moderator.cookie, {}).expect(400);
    await send('post', `/admin/reviews/${reviewB.id}/hide`, moderator.cookie, {
      note: 'Spam',
    }).expect(204);
    await send('post', `/admin/reviews/${reviewB.id}/hide`, moderator.cookie, {
      note: 'Spam',
    }).expect(204);
    expect(await rating(s.slug)).toEqual({ average: 4, count: 1 });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'review.hide', entityId: reviewB.id },
    });
    expect(audit.actorId).toBe(moderator.userId);
    expect(await prisma.auditEvent.count({ where: { entityId: reviewB.id } })).toBe(1);

    // Editing a hidden review keeps it hidden and out of the rating.
    const edited = myReviewResponseSchema.parse(
      (await send('put', path, b.cookie, { rating: 1 }).expect(200)).body,
    );
    expect(edited.review?.hidden).toBe(true);
    expect(await aggregates(s.slug)).toEqual({ ratingSum: 4, ratingCount: 1 });

    // Staff list shows masked phones and filters.
    const staff = adminReviewListSchema.parse(
      (
        await http()
          .get('/api/v1/admin/reviews?status=HIDDEN&maxRating=1')
          .set('Cookie', moderator.cookie)
          .expect(200)
      ).body,
    );
    const row = staff.items.find((r) => r.id === reviewB.id);
    expect(row).toMatchObject({ status: 'HIDDEN', moderationNote: 'Spam', rating: 1 });
    expect(row?.authorPhone).not.toBe(b.phone);
    // Customers cannot moderate.
    await send('post', `/admin/reviews/${reviewB.id}/publish`, a.cookie).expect(403);

    await send('post', `/admin/reviews/${reviewB.id}/publish`, moderator.cookie).expect(204);
    expect(await aggregates(s.slug)).toEqual({ ratingSum: 5, ratingCount: 2 });

    // Deleting removes it from the rating.
    await send('delete', path, a.cookie).expect(204);
    await send('delete', path, a.cookie).expect(204);
    expect(await rating(s.slug)).toEqual({ average: 1, count: 1 });
  });

  it('never double-counts concurrent first submissions', async () => {
    const s = await shop();
    const customer = await buyer(s, true);
    const path = `/products/${s.slug}/reviews/mine`;
    const results = await Promise.all(
      [5, 3, 4].map((r) => send('put', path, customer.cookie, { rating: r })),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const review = await prisma.productReview.findFirstOrThrow({
      where: { userId: customer.userId },
    });
    expect(await aggregates(s.slug)).toEqual({ ratingSum: review.rating, ratingCount: 1 });
  });
});
