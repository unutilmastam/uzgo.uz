import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  sellerAttributesResponseSchema,
  sellerProductListResponseSchema,
  sellerProductResponseSchema,
  storeMembersResponseSchema,
} from '@uzgo/contracts';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, randomIp, randomPhone, TEST_ORIGIN } from './app.js';
import { createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('seller catalogue management', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let smartphones: string;
  let men: string;
  let black: string;
  let white: string;
  let gb128: string;
  let sizeM: string;
  let jpeg: Buffer;
  const http = () => request(app.getHttpServer());
  const send = (
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    cookie: string,
    body?: object,
  ) => {
    const server = http();
    return server[method](`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);
  };
  const productOf = (res: { body: unknown }) => sellerProductResponseSchema.parse(res.body).product;

  async function sellerWithStore(status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' = 'ACTIVE') {
    const seller = await login(app);
    const store = await createStore(prisma, { status, ownerId: seller.userId });
    return { ...seller, storeId: store.id, base: `/seller/stores/${store.id}/products` };
  }

  const draft = (overrides: Record<string, unknown> = {}) => ({
    categoryId: smartphones,
    title: { uz: 'Telefon Oʻzbekiston', ru: 'Телефон Узбекистан' },
    description: { uz: 'Yaxshi telefon', ru: 'Хороший телефон' },
    ...overrides,
  });
  const variant = (overrides: Record<string, unknown> = {}) => ({
    sku: `SKU-${randomUUID().slice(0, 8)}`,
    priceTiyin: '250000000',
    stock: 5,
    optionValueIds: [black, gb128],
    ...overrides,
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const category = (slug: string) => prisma.category.findUniqueOrThrow({ where: { slug } });
    const value = (attribute: string, code: string) =>
      prisma.attributeValue.findFirstOrThrow({ where: { code, attribute: { code: attribute } } });
    smartphones = (await category('smartphones')).id;
    men = (await category('men')).id;
    black = (await value('color', 'black')).id;
    white = (await value('color', 'white')).id;
    gb128 = (await value('memory', '128gb')).id;
    sizeM = (await value('size', 'm')).id;
    jpeg = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#0a3d91' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps' } } })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('runs the full flow: draft → variants → image → submit', async () => {
    const seller = await sellerWithStore();
    const created = productOf(await send('post', seller.base, seller.cookie, draft()).expect(201));
    expect(created.status).toBe('DRAFT');
    expect(created.slug).toMatch(/^telefon-ozbekiston-[0-9a-f]{8}$/);

    // Submitting needs an image and a variant.
    const early = await send('post', `${seller.base}/${created.id}/submit`, seller.cookie).expect(
      409,
    );
    expect(errorCode(early.body)).toBe('IMAGE_REQUIRED');

    const withVariant = productOf(
      await send('post', `${seller.base}/${created.id}/variants`, seller.cookie, variant()).expect(
        201,
      ),
    );
    expect(withVariant.variants[0]).toMatchObject({ priceTiyin: '250000000', stock: 5 });

    const upload = await http()
      .post(`/api/v1${seller.base}/${created.id}/images`)
      .set('Cookie', seller.cookie)
      .set('Origin', TEST_ORIGIN)
      .attach('file', jpeg, { filename: 'photo.php.jpg', contentType: 'application/x-php' })
      .expect(201);
    const image = productOf(upload).images[0];
    expect(image).toMatchObject({ width: 1600, height: 800 });
    const stored = await http()
      .get(new URL(image?.url ?? '', 'http://x').pathname)
      .expect(200);
    expect(stored.headers['content-type']).toBe('image/webp');
    const meta = await sharp(stored.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();

    const submitted = productOf(
      await send('post', `${seller.base}/${created.id}/submit`, seller.cookie).expect(200),
    );
    expect(submitted.status).toBe('PENDING_REVIEW');
    // Not visible until a moderator approves it.
    await http().get(`/api/v1/catalog/products/${created.slug}`).expect(404);

    const list = sellerProductListResponseSchema.parse(
      (
        await http()
          .get(`/api/v1${seller.base}?status=PENDING_REVIEW`)
          .set('Cookie', seller.cookie)
          .expect(200)
      ).body,
    );
    expect(list.items.map((p) => p.id)).toEqual([created.id]);
    expect(list.items[0]).toMatchObject({
      minPriceTiyin: '250000000',
      totalStock: 5,
      variantCount: 1,
    });

    const actions = (
      await prisma.auditEvent.findMany({ where: { entityId: created.id }, orderBy: { id: 'asc' } })
    ).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['product.created', 'product.image_added', 'product.submitted']),
    );
  });

  it('isolates stores: other sellers and customers get 404, staff can edit, only owners manage the team', async () => {
    const owner = await sellerWithStore();
    const product = productOf(await send('post', owner.base, owner.cookie, draft()).expect(201));

    const stranger = await sellerWithStore();
    await http().get(`/api/v1${owner.base}`).set('Cookie', stranger.cookie).expect(404);
    await http()
      .get(`/api/v1${owner.base}/${product.id}`)
      .set('Cookie', stranger.cookie)
      .expect(404);
    await send('patch', `${owner.base}/${product.id}`, stranger.cookie, {
      title: draft().title,
    }).expect(404);
    // Their own store path with someone else's product id is also 404.
    await http()
      .get(`/api/v1${stranger.base}/${product.id}`)
      .set('Cookie', stranger.cookie)
      .expect(404);
    await http().get(`/api/v1${owner.base}`).expect(401);

    // Owner adds a staff member by phone (the person signed in once).
    const staff = await login(app);
    const members = `/seller/stores/${owner.storeId}/members`;
    await send('post', members, owner.cookie, { phone: randomPhone() }).expect(404);
    await send('post', members, owner.cookie, { phone: staff.phone }).expect(204);
    await send('post', members, owner.cookie, { phone: staff.phone }).expect(409);
    const team = storeMembersResponseSchema.parse(
      (await http().get(`/api/v1${members}`).set('Cookie', owner.cookie).expect(200)).body,
    );
    expect(team.items.map((m) => m.role)).toEqual(['OWNER', 'STAFF']);
    const me = await http().get('/api/v1/auth/me').set('Cookie', staff.cookie).expect(200);
    expect((me.body as { user: { roles: string[] } }).user.roles).toContain('SELLER_STAFF');

    await send('patch', `${owner.base}/${product.id}`, staff.cookie, {
      title: { uz: 'Yangi nom', ru: 'Новое имя' },
    }).expect(200);
    await http().get(`/api/v1${members}`).set('Cookie', staff.cookie).expect(403);
    await send('post', members, staff.cookie, { phone: randomPhone() }).expect(403);
    await send('delete', `${members}/${owner.userId}`, staff.cookie).expect(403);
    await send('delete', `${members}/${owner.userId}`, owner.cookie).expect(403);

    await send('delete', `${members}/${staff.userId}`, owner.cookie).expect(204);
    await http().get(`/api/v1${owner.base}/${product.id}`).set('Cookie', staff.cookie).expect(404);
    const after = await http().get('/api/v1/auth/me').set('Cookie', staff.cookie).expect(200);
    expect((after.body as { user: { roles: string[] } }).user.roles).not.toContain('SELLER_STAFF');
  });

  it('lists the attributes a leaf category allows (inherited), with value ids', async () => {
    const seller = await login(app);
    const res = await http()
      .get(`/api/v1/seller/categories/${smartphones}/attributes`)
      .set('Cookie', seller.cookie)
      .expect(200);
    const items = sellerAttributesResponseSchema.parse(res.body).items;
    expect(items.map((a) => a.code).sort()).toEqual(['brand', 'color', 'memory']);
    expect(items.find((a) => a.code === 'color')?.values.map((v) => v.id)).toContain(black);
    const electronics = await prisma.category.findUniqueOrThrow({ where: { slug: 'electronics' } });
    await http()
      .get(`/api/v1/seller/categories/${electronics.id}/attributes`)
      .set('Cookie', seller.cookie)
      .expect(400);
    await http().get(`/api/v1/seller/categories/${smartphones}/attributes`).expect(401);
  });

  it('refuses mass assignment of status, store and price fields on create', async () => {
    const seller = await sellerWithStore();
    for (const extra of [
      { status: 'APPROVED' },
      { storeId: seller.storeId },
      { slug: 'my-slug' },
    ]) {
      await send('post', seller.base, seller.cookie, draft(extra)).expect(400);
    }
    const product = productOf(await send('post', seller.base, seller.cookie, draft()).expect(201));
    await send('patch', `${seller.base}/${product.id}`, seller.cookie, {
      status: 'APPROVED',
    }).expect(400);
  });

  it('validates categories and attributes against the category', async () => {
    const seller = await sellerWithStore();
    const electronics = (
      await prisma.category.findUniqueOrThrow({ where: { slug: 'electronics' } })
    ).id;
    const notLeaf = await send(
      'post',
      seller.base,
      seller.cookie,
      draft({ categoryId: electronics }),
    ).expect(400);
    expect(errorCode(notLeaf.body)).toBe('INVALID_CATEGORY');
    const wrongAttr = await send(
      'post',
      seller.base,
      seller.cookie,
      draft({ attributeValueIds: [sizeM] }),
    ).expect(400);
    expect(errorCode(wrongAttr.body)).toBe('INVALID_ATTRIBUTES');
    await send(
      'post',
      seller.base,
      seller.cookie,
      draft({ attributeValueIds: [black, white] }),
    ).expect(400);

    const product = productOf(await send('post', seller.base, seller.cookie, draft()).expect(201));
    await send('post', `${seller.base}/${product.id}/variants`, seller.cookie, variant()).expect(
      201,
    );
    // Moving to clothing would orphan the memory option.
    const move = await send('patch', `${seller.base}/${product.id}`, seller.cookie, {
      categoryId: men,
    }).expect(400);
    expect(errorCode(move.body)).toBe('INVALID_ATTRIBUTES');
  });

  it('validates variants: prices, unique SKUs and safe stock adjustments', async () => {
    const seller = await sellerWithStore();
    const product = productOf(await send('post', seller.base, seller.cookie, draft()).expect(201));
    const path = `${seller.base}/${product.id}/variants`;
    for (const bad of [
      { priceTiyin: '0' },
      { priceTiyin: '12.5' },
      { priceTiyin: -1 },
      { stock: -1 },
      { stock: 1.5 },
      { sku: 'bad sku' },
      { mxikCode: '123' },
    ]) {
      await send('post', path, seller.cookie, variant(bad)).expect(400);
    }
    const oldPrice = await send(
      'post',
      path,
      seller.cookie,
      variant({ compareAtPriceTiyin: '100' }),
    ).expect(400);
    expect(errorCode(oldPrice.body)).toBe('INVALID_PRICE');

    const first = productOf(
      await send('post', path, seller.cookie, variant({ sku: 'DUP-1' })).expect(201),
    );
    const dup = await send(
      'post',
      path,
      seller.cookie,
      variant({ sku: 'DUP-1', optionValueIds: [white] }),
    ).expect(409);
    expect(errorCode(dup.body)).toBe('SKU_TAKEN');

    const variantId = first.variants[0]?.id ?? '';
    const v = `${path}/${variantId}`;
    await send('patch', v, seller.cookie, { stock: 3, stockAdjust: 1 }).expect(400);
    const adjusted = productOf(
      await send('patch', v, seller.cookie, { stockAdjust: -2 }).expect(200),
    );
    expect(adjusted.variants[0]?.stock).toBe(3);
    const negative = await send('patch', v, seller.cookie, { stockAdjust: -4 }).expect(409);
    expect(errorCode(negative.body)).toBe('STOCK_NEGATIVE');
    const repriced = productOf(
      await send('patch', v, seller.cookie, { priceTiyin: '199900000' }).expect(200),
    );
    expect(repriced.variants[0]?.priceTiyin).toBe('199900000');

    // A variant of another store's product cannot be reached through this product.
    const other = await sellerWithStore();
    await send('patch', `${other.base}/${product.id}/variants/${variantId}`, other.cookie, {
      stock: 99,
    }).expect(404);
  });

  it('sends an approved product back to review after content edits, but not after price or stock edits', async () => {
    const seller = await sellerWithStore();
    const product = productOf(await send('post', seller.base, seller.cookie, draft()).expect(201));
    const withVariant = productOf(
      await send('post', `${seller.base}/${product.id}/variants`, seller.cookie, variant()).expect(
        201,
      ),
    );
    await prisma.product.update({ where: { id: product.id }, data: { status: 'APPROVED' } });

    const v = `${seller.base}/${product.id}/variants/${withVariant.variants[0]?.id ?? ''}`;
    const priced = productOf(
      await send('patch', v, seller.cookie, { priceTiyin: '260000000', stock: 9 }).expect(200),
    );
    expect(priced.status).toBe('APPROVED');

    const edited = productOf(
      await send('patch', `${seller.base}/${product.id}`, seller.cookie, {
        title: { uz: 'Boshqa nom', ru: 'Другое имя' },
      }).expect(200),
    );
    expect(edited.status).toBe('PENDING_REVIEW');
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: product.id, action: 'product.updated' },
    });
    expect(audit.metadata).toMatchObject({ from: 'APPROVED', to: 'PENDING_REVIEW' });
  });

  it('rejects non-images and oversized uploads', async () => {
    const seller = await sellerWithStore();
    const product = productOf(await send('post', seller.base, seller.cookie, draft()).expect(201));
    const upload = (body: Buffer, filename: string, contentType: string) =>
      http()
        .post(`/api/v1${seller.base}/${product.id}/images`)
        .set('Cookie', seller.cookie)
        .set('Origin', TEST_ORIGIN)
        .attach('file', body, { filename, contentType });

    const html = await upload(Buffer.from('<svg onload=alert(1)>'), 'x.jpg', 'image/jpeg').expect(
      400,
    );
    expect(errorCode(html.body)).toBe('INVALID_IMAGE');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await upload(svg, 'x.svg', 'image/svg+xml').expect(400);
    await upload(Buffer.alloc(9 * 1024 * 1024, 1), 'big.jpg', 'image/jpeg').expect(413);
    await http()
      .post(`/api/v1${seller.base}/${product.id}/images`)
      .set('Cookie', seller.cookie)
      .set('Origin', TEST_ORIGIN)
      .expect(400);
    expect(await prisma.productImage.count({ where: { productId: product.id } })).toBe(0);
  });

  it('keeps suspended stores read-only and requires an approved store to submit', async () => {
    const pending = await sellerWithStore('PENDING');
    const product = productOf(
      await send('post', pending.base, pending.cookie, draft()).expect(201),
    );
    const submit = await send(
      'post',
      `${pending.base}/${product.id}/submit`,
      pending.cookie,
    ).expect(409);
    expect(errorCode(submit.body)).toBe('STORE_NOT_APPROVED');

    await prisma.store.update({ where: { id: pending.storeId }, data: { status: 'SUSPENDED' } });
    await http().get(`/api/v1${pending.base}`).set('Cookie', pending.cookie).expect(200);
    const blocked = await send('post', pending.base, pending.cookie, draft()).expect(403);
    expect(errorCode(blocked.body)).toBe('STORE_NOT_ACTIVE');
  });

  it('archives and restores products', async () => {
    const seller = await sellerWithStore();
    const product = productOf(await send('post', seller.base, seller.cookie, draft()).expect(201));
    expect(
      productOf(
        await send('post', `${seller.base}/${product.id}/archive`, seller.cookie).expect(200),
      ).status,
    ).toBe('ARCHIVED');
    await send('post', `${seller.base}/${product.id}/archive`, seller.cookie).expect(409);
    await send('patch', `${seller.base}/${product.id}`, seller.cookie, {
      title: draft().title,
    }).expect(409);
    expect(
      productOf(
        await send('post', `${seller.base}/${product.id}/restore`, seller.cookie).expect(200),
      ).status,
    ).toBe('DRAFT');
  });
});
