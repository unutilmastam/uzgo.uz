import type { NestExpressApplication } from '@nestjs/platform-express';
import { categoryDetailResponseSchema, categoryTreeResponseSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './app.js';

describe('catalog categories', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the active category tree with localized names', async () => {
    const res = await http().get('/api/v1/catalog/categories').expect(200);
    const { items } = categoryTreeResponseSchema.parse(res.body);
    expect(items.map((c) => c.slug)).toEqual(
      expect.arrayContaining(['electronics', 'clothing', 'groceries', 'home']),
    );
    const electronics = items.find((c) => c.slug === 'electronics');
    expect(electronics?.name).toEqual({ uz: 'Elektronika', ru: 'Электроника' });
    expect(electronics?.children.map((c) => c.slug)).toContain('smartphones');
    expect(items.find((c) => c.slug === 'home')?.name.uz).toBe('Uy va bogʻ');
  });

  it('returns breadcrumbs, children and inherited filters', async () => {
    const res = await http().get('/api/v1/catalog/categories/smartphones').expect(200);
    const detail = categoryDetailResponseSchema.parse(res.body);
    expect(detail.breadcrumbs.map((b) => b.slug)).toEqual(['electronics']);
    expect(detail.filters.map((f) => f.code)).toEqual(['brand', 'color', 'memory']);
    expect(detail.filters.find((f) => f.code === 'color')?.values.map((v) => v.code)).toContain(
      'black',
    );
  });

  it('hides inactive categories and validates slugs', async () => {
    const prisma = app.get(PrismaService);
    await prisma.category.update({ where: { slug: 'electronics' }, data: { active: false } });
    try {
      await http().get('/api/v1/catalog/categories/smartphones').expect(404);
      const { items } = categoryTreeResponseSchema.parse(
        (await http().get('/api/v1/catalog/categories').expect(200)).body,
      );
      expect(items.map((c) => c.slug)).not.toContain('electronics');
    } finally {
      await prisma.category.update({ where: { slug: 'electronics' }, data: { active: true } });
    }
    await http().get('/api/v1/catalog/categories/NOT_A_SLUG').expect(400);
    await http().get('/api/v1/catalog/categories/does-not-exist').expect(404);
  });
});
