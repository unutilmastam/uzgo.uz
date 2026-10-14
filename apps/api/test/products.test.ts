import type { NestExpressApplication } from '@nestjs/platform-express';
import { productDetailResponseSchema, storeDetailResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './app.js';
import { createProduct, createStore } from './fixtures.js';

describe('products and stores (storefront visibility)', () => {
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

  it('returns an approved product with variants, prices as tiyin strings and breadcrumbs', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [
        { priceTiyin: 279_900_000n, stock: 150, compareAtPriceTiyin: 329_900_000n },
        { priceTiyin: 319_900_000n, stock: 0 },
      ],
    });
    const res = await http().get(`/api/v1/catalog/products/${product.slug}`).expect(200);
    const { product: detail } = productDetailResponseSchema.parse(res.body);
    expect(detail.variants.map((v) => v.priceTiyin)).toEqual(['279900000', '319900000']);
    expect(detail.variants[0]?.compareAtPriceTiyin).toBe('329900000');
    expect(detail.variants.map((v) => v.available)).toEqual([99, 0]);
    expect(detail.breadcrumbs.map((b) => b.slug)).toEqual(['electronics']);
    expect(detail.store.slug).toBe(store.slug);
  });

  it('hides products that are not approved, deleted, or from inactive stores', async () => {
    const store = await createStore(prisma);
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED'] as const) {
      const p = await createProduct(prisma, { storeId: store.id, status });
      await http().get(`/api/v1/catalog/products/${p.slug}`).expect(404);
    }
    const deleted = await createProduct(prisma, { storeId: store.id });
    await prisma.product.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    await http().get(`/api/v1/catalog/products/${deleted.slug}`).expect(404);

    const suspended = await createStore(prisma, { status: 'SUSPENDED' });
    const p = await createProduct(prisma, { storeId: suspended.id });
    await http().get(`/api/v1/catalog/products/${p.slug}`).expect(404);
    await http().get(`/api/v1/catalog/stores/${suspended.slug}`).expect(404);
  });

  it('returns active stores', async () => {
    const store = await createStore(prisma);
    const res = await http().get(`/api/v1/catalog/stores/${store.slug}`).expect(200);
    expect(storeDetailResponseSchema.parse(res.body).store.isDemo).toBe(false);
  });

  it('enforces money and stock constraints in the database', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, { storeId: store.id });
    const variantId = product.variants[0]?.id ?? '';
    await expect(
      prisma.productVariant.update({ where: { id: variantId }, data: { stock: -1 } }),
    ).rejects.toThrow();
    await expect(
      prisma.productVariant.update({ where: { id: variantId }, data: { priceTiyin: -1n } }),
    ).rejects.toThrow();
    await expect(
      prisma.productVariant.update({ where: { id: variantId }, data: { mxikCode: '123' } }),
    ).rejects.toThrow();
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { mxikCode: '06101001001000000' },
    });
  });

  it('keeps SKUs unique per store', async () => {
    const store = await createStore(prisma);
    const product = await createProduct(prisma, { storeId: store.id });
    const sku = product.variants[0]?.sku ?? '';
    await expect(
      prisma.productVariant.create({
        data: { productId: product.id, storeId: store.id, sku, priceTiyin: 1n, stock: 1 },
      }),
    ).rejects.toThrow();
  });

  it('serves stored media only for valid keys', async () => {
    await http().get('/api/v1/media/products/missing.webp').expect(404);
    await http().get('/api/v1/media/..%2F..%2Fetc%2Fpasswd').expect(404);
  });

  it('includes the labelled demo catalogue when seeded', async () => {
    const demo = await prisma.store.findUnique({ where: { slug: 'demo-elektronika' } });
    if (!demo) return; // demo data is optional (SEED_DEMO)
    const res = await http().get('/api/v1/catalog/products/nova-x5-smartfon').expect(200);
    const { product } = productDetailResponseSchema.parse(res.body);
    expect(product.store.isDemo).toBe(true);
    expect(product.attributes.map((a) => `${a.attribute}:${a.code}`)).toContain('brand:nova');
    await http().get('/api/v1/catalog/products/moderatsiyadagi-smartfon').expect(404);
  });
});
