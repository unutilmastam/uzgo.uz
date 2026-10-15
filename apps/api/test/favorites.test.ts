import type { NestExpressApplication } from '@nestjs/platform-express';
import { favoriteIdsResponseSchema, favoritesResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

describe('favorites (Phase 9a)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const send = (method: 'put' | 'delete', path: string, cookie: string) =>
    http()[method](`/api/v1${path}`).set('Cookie', cookie).set('Origin', TEST_ORIGIN);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('saves, lists and removes products; only for the owner', async () => {
    const store = await createStore(prisma);
    const a = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 3 }],
    });
    const b = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 2_000_00n, stock: 3 }],
    });
    const draft = await createProduct(prisma, {
      storeId: store.id,
      status: 'DRAFT',
      variants: [{ priceTiyin: 3_000_00n, stock: 3 }],
    });
    const user = await login(app);
    const other = await login(app);

    await http().get('/api/v1/favorites').expect(401);
    await send('put', `/favorites/${a.id}`, user.cookie).expect(204);
    await send('put', `/favorites/${a.id}`, user.cookie).expect(204); // idempotent
    await send('put', `/favorites/${b.id}`, user.cookie).expect(204);
    // Products that are not on sale cannot be saved.
    await send('put', `/favorites/${draft.id}`, user.cookie).expect(404);
    await send('put', '/favorites/not-a-uuid', user.cookie).expect(400);

    const list = favoritesResponseSchema.parse(
      (await http().get('/api/v1/favorites').set('Cookie', user.cookie).expect(200)).body,
    );
    expect(list.items.map((p) => p.id)).toEqual([b.id, a.id]);
    const ids = favoriteIdsResponseSchema.parse(
      (await http().get('/api/v1/favorites/ids').set('Cookie', user.cookie).expect(200)).body,
    );
    expect(ids.productIds.sort()).toEqual([a.id, b.id].sort());
    // Someone else's list is separate.
    const theirs = favoritesResponseSchema.parse(
      (await http().get('/api/v1/favorites').set('Cookie', other.cookie).expect(200)).body,
    );
    expect(theirs.items).toEqual([]);

    // A product that goes off sale disappears from the list but stays saved.
    await prisma.product.update({ where: { id: b.id }, data: { status: 'ARCHIVED' } });
    const after = favoritesResponseSchema.parse(
      (await http().get('/api/v1/favorites').set('Cookie', user.cookie).expect(200)).body,
    );
    expect(after.items.map((p) => p.id)).toEqual([a.id]);

    await send('delete', `/favorites/${a.id}`, user.cookie).expect(204);
    await send('delete', `/favorites/${a.id}`, other.cookie).expect(204);
    expect(await prisma.favorite.count({ where: { userId: user.userId } })).toBe(1);
  });
});
