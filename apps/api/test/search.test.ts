import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, productListResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { reindexProducts } from '../src/search/search-index.js';
import { createTestApp } from './app.js';
import { createProduct, createStore } from './fixtures.js';

describe('product search and listings', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  /** Unique latin token so results are isolated from other data in the shared DB. */
  const tag = `zq${randomUUID()
    .slice(0, 6)
    .replace(/[^a-z]/g, 'x')}`;
  let storeSlug = '';

  const list = async (query: string) => {
    const res = await http().get(`/api/v1/catalog/products?${query}`).expect(200);
    return productListResponseSchema.parse(res.body);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const store = await createStore(prisma);
    storeSlug = store.slug;
    await createProduct(prisma, {
      storeId: store.id,
      categorySlug: 'kettles',
      title: { uz: `Koʻk choynak ${tag}`, ru: `Синий чайник ${tag}` },
      variants: [{ priceTiyin: 250_000_00n, stock: 5 }],
    });
    await createProduct(prisma, {
      storeId: store.id,
      categorySlug: 'smartphones',
      title: { uz: `Smartfon ${tag} A`, ru: `Смартфон ${tag} A` },
      variants: [{ priceTiyin: 1_500_000_00n, stock: 3 }],
    });
    const blue = await createProduct(prisma, {
      storeId: store.id,
      categorySlug: 'smartphones',
      title: { uz: `Smartfon ${tag} B`, ru: `Смартфон ${tag} B` },
      variants: [{ priceTiyin: 2_800_000_00n, stock: 2 }],
    });
    const blueValue = await prisma.attributeValue.findFirstOrThrow({
      where: { code: 'blue', attribute: { code: 'color' } },
    });
    await prisma.variantAttributeValue.create({
      data: { variantId: blue.variants[0]?.id ?? '', attributeValueId: blueValue.id },
    });
    await createProduct(prisma, {
      storeId: store.id,
      title: { uz: `Tugagan ${tag}`, ru: `Нет в наличии ${tag}` },
      variants: [{ priceTiyin: 100n, stock: 0 }],
    });
    await createProduct(prisma, {
      storeId: store.id,
      status: 'PENDING_REVIEW',
      title: { uz: `Moderatsiyada ${tag}`, ru: `На модерации ${tag}` },
    });
    await reindexProducts(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('finds products across Uzbek Latin, Uzbek Cyrillic and Russian spellings', async () => {
    for (const q of [`choynak ${tag}`, `чойнак ${tag}`, `чайник ${tag}`, `CHOYNAK ${tag}`]) {
      const result = await list(`q=${encodeURIComponent(q)}`);
      expect(
        result.items.map((p) => p.title.uz),
        q,
      ).toEqual([`Koʻk choynak ${tag}`]);
    }
    // "koʻk" (blue) also matches the blue phone's colour option — in every spelling.
    for (const q of [`koʻk ${tag}`, `ko'k ${tag}`, `ko‘k ${tag}`, `кўк ${tag}`, `KOʻK ${tag}`]) {
      const result = await list(`q=${encodeURIComponent(q)}`);
      expect(result.items.map((p) => p.title.uz).sort(), q).toEqual([
        `Koʻk choynak ${tag}`,
        `Smartfon ${tag} B`,
      ]);
    }
  });

  it('matches word prefixes and category names', async () => {
    const result = await list(`q=${encodeURIComponent(`smartf ${tag}`)}`);
    expect(result.total).toBe(2);
    const byCategory = await list(`q=${encodeURIComponent(`elektronika ${tag}`)}`);
    expect(byCategory.total).toBe(2);
  });

  it('only lists approved, in-stock products', async () => {
    const result = await list(`q=${tag}&pageSize=48`);
    const titles = result.items.map((p) => p.title.uz);
    expect(titles).not.toContain(`Tugagan ${tag}`);
    expect(titles).not.toContain(`Moderatsiyada ${tag}`);
    expect(result.total).toBe(3);
  });

  it('filters by category subtree, store, price and attributes', async () => {
    expect((await list(`q=${tag}&category=electronics`)).total).toBe(2);
    expect((await list(`q=${tag}&category=kettles`)).total).toBe(1);
    expect((await list(`store=${storeSlug}`)).total).toBe(3);
    expect(
      (await list(`q=${tag}&minPrice=1000000&maxPrice=2000000`)).items.map((p) => p.title.uz),
    ).toEqual([`Smartfon ${tag} A`]);
    expect((await list(`q=${tag}&attr=color:blue`)).items.map((p) => p.title.uz)).toEqual([
      `Smartfon ${tag} B`,
    ]);
    expect((await list(`q=${tag}&attr=color:blue&attr=color:black`)).total).toBe(1);
    expect((await list(`q=${tag}&attr=color:red`)).total).toBe(0);
  });

  it('sorts by price and paginates with a total', async () => {
    const asc = await list(`q=${tag}&sort=price_asc`);
    expect(asc.items.map((p) => p.priceTiyin)).toEqual(['25000000', '150000000', '280000000']);
    const desc = await list(`q=${tag}&sort=price_desc`);
    expect(desc.items[0]?.priceTiyin).toBe('280000000');
    const page2 = await list(`q=${tag}&sort=price_asc&pageSize=2&page=2`);
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page2.items.map((p) => p.priceTiyin)).toEqual(['280000000']);
  });

  it('treats hostile input as plain text', async () => {
    for (const q of ['\'; DROP TABLE "Product"; --', 'a:* | !b & (c)', '%_%', '<script>']) {
      const res = await http()
        .get(`/api/v1/catalog/products?q=${encodeURIComponent(q)}`)
        .expect(200);
      productListResponseSchema.parse(res.body);
    }
    expect(await prisma.product.count()).toBeGreaterThan(0);
  });

  it('rejects invalid query parameters', async () => {
    for (const query of [
      'pageSize=1000',
      'page=0',
      'sort=random',
      'attr=color',
      'attr=COLOR:Black',
      'minPrice=10&maxPrice=5',
      'category=Not_A_Slug',
      'unknown=1',
    ]) {
      const res = await http().get(`/api/v1/catalog/products?${query}`).expect(400);
      expect(apiErrorSchema.parse(res.body).error.code, query).toBe('VALIDATION_FAILED');
    }
    await http().get('/api/v1/catalog/products?category=does-not-exist').expect(404);
  });
});
