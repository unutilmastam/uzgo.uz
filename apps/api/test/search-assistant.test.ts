import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  assistantReplySchema,
  assistantStatusSchema,
  searchAllSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { reindexFood } from '../src/search/food-index.js';
import { createTestApp, login, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createRestaurant, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
/** A word no other data contains, so runs on a shared database never interfere. */
const TAG = `zx${randomUUID().replace(/-/g, '').slice(0, 8)}`;

describe('Unified search and the shopping assistant (ADR 0026)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let productSlug = '';
  let restaurantSlug = '';
  const http = () => request(app.getHttpServer());
  const chat = (cookie: string, messages: object[], locale = 'uz') =>
    http()
      .post('/api/v1/assistant/chat')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send({ locale, messages });

  beforeAll(async () => {
    app = await createTestApp({
      env: { ASSISTANT_PROVIDER: 'fake', ASSISTANT_DAILY_LIMIT: '3' },
    });
    prisma = app.get(PrismaService);
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      title: { uz: `Elektr choynak ${TAG}`, ru: `Электрочайник ${TAG}` },
      variants: [{ priceTiyin: 250_000_00n, stock: 5 }],
    });
    productSlug = product.slug;
    const { store: restaurant, dishes } = await createRestaurant(prisma);
    restaurantSlug = restaurant.slug;
    await prisma.store.update({
      where: { id: restaurant.id },
      data: { name: { uz: `Rayhon ${TAG}`, ru: `Райхон ${TAG}` } },
    });
    await prisma.foodMenuItem.update({
      where: { id: dishes[0]?.id ?? '' },
      data: { name: { uz: `Toʻy oshi ${TAG}`, ru: `Свадебный плов ${TAG}` } },
    });
    await reindexFood(prisma, [restaurant.id]);
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('finds products, restaurants and dishes in one query, in any script', async () => {
    const all = searchAllSchema.parse(
      (await http().get(`/api/v1/search/all?q=${TAG}`).expect(200)).body,
    );
    expect(all.products.map((p) => p.slug)).toEqual([productSlug]);
    expect(all.restaurants.map((r) => r.slug)).toEqual([restaurantSlug]);
    expect(all.dishes.map((d) => d.restaurant.slug)).toEqual([restaurantSlug]);

    // Russian Cyrillic and Uzbek Latin with an apostrophe variant meet the same dish.
    const plov = searchAllSchema.parse(
      (
        await http()
          .get(`/api/v1/search/all?q=${encodeURIComponent(`плов ${TAG}`)}`)
          .expect(200)
      ).body,
    );
    expect(plov.dishes).toHaveLength(1);
    const osh = searchAllSchema.parse(
      (
        await http()
          .get(`/api/v1/search/all?q=${encodeURIComponent(`to'y ${TAG}`)}`)
          .expect(200)
      ).body,
    );
    expect(osh.dishes[0]?.name.uz).toBe(`Toʻy oshi ${TAG}`);
    expect(osh.products).toHaveLength(0);

    // Suspended restaurants and archived dishes are not found.
    await prisma.foodMenuItem.updateMany({
      where: { store: { slug: restaurantSlug } },
      data: { archived: true },
    });
    const gone = searchAllSchema.parse(
      (await http().get(`/api/v1/search/all?q=${TAG}`).expect(200)).body,
    );
    expect(gone.dishes).toHaveLength(0);
    await prisma.foodMenuItem.updateMany({
      where: { store: { slug: restaurantSlug } },
      data: { archived: false },
    });
    await http().get('/api/v1/search/all?q=').expect(400);
  });

  it('answers signed-in users with cards only for items the tools found', async () => {
    const guest = assistantStatusSchema.parse(
      (await http().get('/api/v1/assistant/status').expect(200)).body,
    );
    expect(guest).toEqual({ enabled: true, dailyLimit: 3, remainingToday: null });
    await http()
      .post('/api/v1/assistant/chat')
      .set('Origin', TEST_ORIGIN)
      .send({ locale: 'uz', messages: [{ role: 'user', text: 'Salom' }] })
      .expect(401);

    const user = await login(app);
    const reply = assistantReplySchema.parse(
      (await chat(user.cookie, [{ role: 'user', text: `Menga choynak kerak: ${TAG}` }]).expect(200))
        .body,
    );
    expect(reply.reply).toContain(`(/p/${productSlug})`);
    expect(reply.cards).toEqual([
      expect.objectContaining({ type: 'product', slug: productSlug, priceTiyin: '25000000' }),
    ]);
    expect(reply.remainingToday).toBe(2);

    const food = assistantReplySchema.parse(
      (
        await chat(user.cookie, [
          { role: 'user', text: 'Salom' },
          { role: 'assistant', text: 'Salom! Nima kerak?' },
          { role: 'user', text: `Restoran osh ${TAG}` },
        ]).expect(200)
      ).body,
    );
    expect(food.cards.map((c) => c.type)).toEqual(['restaurant']);
    expect(food.reply).toContain(`(/food/${restaurantSlug})`);

    // The last turn must be the user's (length limits: contract tests).
    await chat(user.cookie, [{ role: 'assistant', text: 'Hi' }]).expect(400);

    // No message text is stored; only counters.
    const usage = await prisma.assistantUsage.findMany({ where: { userId: user.userId } });
    expect(usage).toHaveLength(1);
    expect(usage[0]?.messages).toBe(2);
    expect(usage[0]?.inputTokens).toBeGreaterThan(0);
  });

  it('stops at the daily limit, even for parallel requests', async () => {
    const user = await login(app);
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => chat(user.cookie, [{ role: 'user', text: `Qidir ${TAG}` }])),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(errorCode(results.find((r) => r.status === 429)?.body)).toBe('ASSISTANT_DAILY_LIMIT');
    const status = assistantStatusSchema.parse(
      (await http().get('/api/v1/assistant/status').set('Cookie', user.cookie).expect(200)).body,
    );
    expect(status.remainingToday).toBe(0);
  });

  it('is off without a provider and when the monthly budget is spent', async () => {
    const spent = await createTestApp({
      env: { ASSISTANT_PROVIDER: 'fake', ASSISTANT_MONTHLY_TOKEN_BUDGET: '1' },
    });
    const off = await createTestApp({ env: { ASSISTANT_PROVIDER: 'anthropic' } });
    try {
      const user = await login(spent);
      const res = await request(spent.getHttpServer())
        .post('/api/v1/assistant/chat')
        .set('Cookie', user.cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ locale: 'ru', messages: [{ role: 'user', text: 'Привет' }] })
        .expect(503);
      expect(errorCode(res.body)).toBe('ASSISTANT_BUDGET_EXHAUSTED');

      const status = assistantStatusSchema.parse(
        (await request(off.getHttpServer()).get('/api/v1/assistant/status').expect(200)).body,
      );
      expect(status.enabled).toBe(false);
      const other = await login(off);
      const disabled = await request(off.getHttpServer())
        .post('/api/v1/assistant/chat')
        .set('Cookie', other.cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ locale: 'uz', messages: [{ role: 'user', text: 'Salom' }] })
        .expect(503);
      expect(errorCode(disabled.body)).toBe('ASSISTANT_DISABLED');
    } finally {
      await Promise.all([spent.close(), off.close()]);
    }
  });
});
