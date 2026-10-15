import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { API, grantRole, loginOnPage, randomLocalPhone, totp } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

const ORIGIN = 'http://localhost:3100';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Seller actions through the same-site API, with the seller's browser session. */
function sellerApi(page: Page) {
  const api = page.request;
  const call = async (method: 'post' | 'get', path: string, data?: unknown) => {
    const res = await api[method](`${ORIGIN}/api/v1${path}`, {
      headers: { Origin: ORIGIN },
      ...(data === undefined ? {} : { data }),
    });
    expect(res.ok(), `${method} ${path}: ${String(res.status())}`).toBe(true);
    return (await res.json()) as Record<string, unknown>;
  };
  return { api, call };
}

async function loginAt(page: Page, request: APIRequestContext, path: string, phone?: string) {
  await page.goto(path);
  return loginOnPage(page, request, phone);
}

test('staff back office: TOTP → approve store → moderate product → storefront', async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  // 1. A seller applies and prepares a product.
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  await loginAt(seller, request, '/uz/login');
  await expect(seller).not.toHaveURL(/login/);
  const { api, call } = sellerApi(seller);
  const storeName = `E2E doʻkon ${String(Date.now())}`;
  const { store } = (await call('post', '/seller/stores', {
    name: { uz: storeName, ru: storeName },
    slug: `e2e-admin-${String(Date.now())}`,
    districtId: await (async () => {
      const regions = (await call('get', '/geo/regions')) as {
        items: { id: string; code: string }[];
      };
      const region = regions.items.find((r) => r.code === 'UZ-SU');
      const districts = (await call('get', `/geo/regions/${region?.id ?? ''}/districts`)) as {
        items: { id: string }[];
      };
      return districts.items[0]?.id;
    })(),
    legalType: 'LEGAL_ENTITY',
    legalName: 'MChJ Sinov',
    taxId: '987654321',
    contactPhone: '+998901112233',
  })) as { store: { id: string } };

  // 2. Staff: non-staff get 404; staff must enrol TOTP before anything else.
  const admin = await browser.newPage();
  const adminPhone = randomLocalPhone();
  await loginAt(admin, request, '/uz/login', adminPhone);
  await expect(admin).not.toHaveURL(/login/);
  const forbidden = await admin.goto('/uz/admin');
  expect(forbidden?.status()).toBe(404);
  await grantRole(request, adminPhone, 'ADMIN');

  await admin.goto('/uz/admin');
  await expect(admin).toHaveURL(/\/uz\/admin\/security$/);
  await admin.getByRole('button', { name: 'Sozlashni boshlash' }).click();
  const secret = await admin.getByTestId('totp-secret').getAttribute('data-secret');
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  await admin.getByLabel('Tasdiqlash kodi').fill(totp(secret ?? ''));
  await admin.getByRole('button', { name: 'Yoqish', exact: true }).click();
  await expect(admin).toHaveURL(/\/uz\/admin$/);
  await expect(admin.getByRole('link', { name: /Tekshiruvdagi doʻkonlar/ })).toBeVisible();

  // 3. Approve the store.
  await admin.goto('/uz/admin/stores?status=PENDING');
  const storeCard = admin.getByTestId('admin-store').filter({ hasText: storeName });
  await expect(storeCard).toContainText('987654321');
  await storeCard.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await expect(admin.getByText('Bajarildi')).toBeVisible();
  await expect(storeCard).toHaveCount(0);

  // 4. The seller builds and submits a product.
  const categories = (await call('get', '/catalog/categories')) as {
    items: { slug: string; children: { id: string; slug: string }[] }[];
  };
  const smartphones = categories.items
    .flatMap((c) => c.children)
    .find((c) => c.slug === 'smartphones');
  const base = `/seller/stores/${store.id}/products`;
  const { product } = (await call('post', base, {
    categoryId: smartphones?.id,
    title: { uz: `E2E telefon ${String(Date.now())}`, ru: 'E2E телефон' },
    description: { uz: 'Tavsif', ru: 'Описание' },
  })) as { product: { id: string; slug: string; title: { uz: string } } };
  await call('post', `${base}/${product.id}/variants`, {
    sku: 'E2E-ADM',
    priceTiyin: '99900000',
    stock: 3,
  });
  const upload = await api.post(`${ORIGIN}/api/v1${base}/${product.id}/images`, {
    headers: { Origin: ORIGIN },
    multipart: { file: { name: 'p.png', mimeType: 'image/png', buffer: PNG } },
  });
  expect(upload.status()).toBe(201);
  await call('post', `${base}/${product.id}/submit`);

  // Not on the storefront before moderation (checked on the API: the page
  // itself is not visited yet, so no response is cached).
  expect((await request.get(`${API}/catalog/products/${product.slug}`)).status()).toBe(404);

  // 5. Moderate.
  await admin.goto('/uz/admin/products');
  await admin.getByRole('link', { name: new RegExp(product.title.uz) }).click();
  await expect(admin.getByRole('heading', { name: product.title.uz })).toBeVisible();
  await expect(admin.getByText('E2E-ADM', { exact: false })).toBeVisible();
  await admin.getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await expect(admin.getByText('Sotuvda').first()).toBeVisible();
  expect((await request.get(`${API}/catalog/products/${product.slug}`)).status()).toBe(200);

  const after = await seller.goto(`/uz/p/${product.slug}`);
  expect(after?.status()).toBe(200);
  await expect(seller.getByRole('heading', { name: product.title.uz })).toBeVisible();

  // 6. The audit log records the decisions.
  await admin.goto('/uz/admin/audit?action=product.');
  await expect(
    admin.getByTestId('audit-event').filter({ hasText: 'product.approved' }).first(),
  ).toBeVisible();
  await sellerContext.close();
});
