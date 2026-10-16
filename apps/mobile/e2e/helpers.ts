import { createHmac, randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';

export const API = 'http://localhost:4100/api/v1';
const MOBILE = { 'x-uzgo-client': 'mobile' };

export function randomLocalPhone(): string {
  return `90${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

export async function lastOtp(request: APIRequestContext, localPhone: string): Promise<string> {
  const res = await request.get(`${API}/__test__/last-otp?phone=%2B998${localPhone}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { code: string }).code;
}

/** A signed-in API client using the app's protocol (bearer token, no cookies). */
export async function apiUser(request: APIRequestContext, localPhone = randomLocalPhone()) {
  const phone = `+998${localPhone}`;
  await request.post(`${API}/auth/otp/request`, { headers: MOBILE, data: { phone } });
  const verify = await request.post(`${API}/auth/otp/verify`, {
    headers: MOBILE,
    data: { phone, code: await lastOtp(request, localPhone) },
  });
  expect(verify.ok()).toBe(true);
  const { session, user } = (await verify.json()) as {
    session: { token: string };
    user: { id: string };
  };
  const headers = { ...MOBILE, authorization: `Bearer ${session.token}` };
  const call = async (method: 'get' | 'post' | 'put' | 'patch', path: string, data?: unknown) => {
    const res = await request[method](`${API}${path}`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      ...(data === undefined ? {} : { data }),
    });
    expect(res.ok(), `${method} ${path}: ${String(res.status())} ${await res.text()}`).toBe(true);
    return res.status() === 204 ? {} : ((await res.json()) as Record<string, unknown>);
  };
  return { localPhone, userId: user.id, token: session.token, headers, call };
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string): string {
  let bits = '';
  for (const char of secret.replace(/=+$/, ''))
    bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => Number.parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A seller with an approved store and a live product (via the real API and a
 * staff account with TOTP), for the seller screens of the app.
 */
export async function liveProduct(request: APIRequestContext) {
  const seller = await apiUser(request);
  const regions = (await seller.call('get', '/geo/regions')) as {
    items: { id: string; code: string }[];
  };
  const region = regions.items.find((r) => r.code === 'UZ-SU');
  const districts = (await seller.call('get', `/geo/regions/${region?.id ?? ''}/districts`)) as {
    items: { id: string }[];
  };
  const stamp = String(Date.now());
  const { store } = (await seller.call('post', '/seller/stores', {
    name: { uz: `Mobil doʻkon ${stamp}`, ru: `Мобильный магазин ${stamp}` },
    slug: `mobile-e2e-${stamp}`,
    districtId: districts.items[0]?.id,
    legalType: 'LEGAL_ENTITY',
    legalName: 'MChJ Mobil',
    taxId: '987654321',
    contactPhone: '+998901112233',
  })) as { store: { id: string } };

  const admin = await apiUser(request);
  const grant = await request.post(`${API}/__test__/grant-role`, {
    data: { phone: `+998${admin.localPhone}`, role: 'ADMIN' },
  });
  expect(grant.status()).toBe(204);
  const { secret } = (await admin.call('post', '/auth/totp/setup')) as { secret: string };
  await admin.call('post', '/auth/totp/enable', { code: totp(secret) });
  await admin.call('post', `/admin/stores/${store.id}/approve`, {});

  const categories = (await seller.call('get', '/catalog/categories')) as {
    items: { children: { id: string; slug: string }[] }[];
  };
  const smartphones = categories.items
    .flatMap((c) => c.children)
    .find((c) => c.slug === 'smartphones');
  const base = `/seller/stores/${store.id}/products`;
  const title = `Mobil telefon ${stamp}`;
  const { product } = (await seller.call('post', base, {
    categoryId: smartphones?.id,
    title: { uz: title, ru: `Мобильный телефон ${stamp}` },
    description: { uz: 'Tavsif', ru: 'Описание' },
  })) as { product: { id: string; slug: string } };
  const withVariant = (await seller.call('post', `${base}/${product.id}/variants`, {
    sku: `MOB-${stamp}`,
    priceTiyin: '50000000',
    stock: 5,
  })) as { product: { variants: { id: string }[] } };
  const variantId = withVariant.product.variants[0]?.id ?? '';
  const upload = await request.post(`${API}${base}/${product.id}/images`, {
    headers: seller.headers,
    multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: PNG } },
  });
  expect(upload.status()).toBe(201);
  await seller.call('post', `${base}/${product.id}/submit`);
  await admin.call('post', `/admin/products/${product.id}/approve`, {});
  return { seller, store, product, title, variantId };
}

/** Completes the app's login screen (phone → SMS code). */
export async function loginInApp(page: Page, request: APIRequestContext, localPhone: string) {
  await page.getByLabel('Telefon raqami').fill(localPhone);
  await page.getByRole('button', { name: 'Kodni olish' }).click();
  await expect(page.getByLabel('Tasdiqlash kodi')).toBeVisible();
  await page.getByLabel('Tasdiqlash kodi').fill(await lastOtp(request, localPhone));
}

/** Opens the app already signed in (the login screen itself is covered by the buyer test). */
export async function signedInPage(page: Page, token: string) {
  await page.addInitScript((value) => {
    sessionStorage.setItem('uzgo.session', value);
  }, token);
}

/** An admin with TOTP enrolled (API only). */
export async function staffAdmin(request: APIRequestContext) {
  const admin = await apiUser(request);
  const grant = await request.post(`${API}/__test__/grant-role`, {
    data: { phone: `+998${admin.localPhone}`, role: 'ADMIN' },
  });
  expect(grant.status()).toBe(204);
  const { secret } = (await admin.call('post', '/auth/totp/setup')) as { secret: string };
  await admin.call('post', '/auth/totp/enable', { code: totp(secret) });
  return admin;
}

/** Termiz: restaurant and a customer ~0.5 km away (WGS 84). */
export const RESTAURANT_POINT = { lat: 37.2242, lng: 67.2783 };
export const HOME_POINT = { latitude: 37.2286, longitude: 67.2756 };

/** A UZGO-courier restaurant (open all week) with one dish, added by staff. */
export async function liveRestaurant(request: APIRequestContext) {
  const owner = await apiUser(request);
  const admin = await staffAdmin(request);
  const regions = (await admin.call('get', '/geo/regions')) as {
    items: { id: string; code: string }[];
  };
  const districts = (await admin.call(
    'get',
    `/geo/regions/${regions.items.find((r) => r.code === 'UZ-SU')?.id ?? ''}/districts`,
  )) as { items: { id: string }[] };
  const stamp = String(Date.now()).slice(-7);
  const name = `Mobil oshxona ${stamp}`;
  const { restaurant } = (await admin.call('post', '/admin/restaurants', {
    name: { uz: name, ru: `Мобильное кафе ${stamp}` },
    slug: `mobil-osh-${stamp}`,
    ownerPhone: `+998${owner.localPhone}`,
    districtId: districts.items[0]?.id,
    address: 'Alpomish koʻchasi, 1',
    ...RESTAURANT_POINT,
    deliveryMode: 'UZGO',
    openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '00:00', close: '00:00' })),
  })) as { restaurant: { id: string; menu: { id: string }[] } };
  const base = `/admin/restaurants/${restaurant.id}/menu`;
  const withCategory = (await admin.call('post', `${base}/categories`, {
    name: { uz: 'Osh', ru: 'Плов' },
  })) as { restaurant: { menu: { id: string }[] } };
  await admin.call('post', `${base}/items`, {
    categoryId: withCategory.restaurant.menu[0]?.id,
    name: { uz: 'Toʻy oshi', ru: 'Свадебный плов' },
    priceTiyin: '3500000',
  });
  return { owner, admin, name, slug: `mobil-osh-${stamp}`, storeId: restaurant.id };
}
