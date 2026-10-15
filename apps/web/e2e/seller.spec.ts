import { expect, test } from '@playwright/test';
import { loginOnPage } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

// 1×1 PNG; the API decodes and re-encodes it to WebP.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('seller applies for a store and prepares a draft product', async ({ page, request }) => {
  await page.goto('/uz/seller');
  await expect(page).toHaveURL(/\/uz\/login\?next=%2Fseller$/);
  await loginOnPage(page, request);
  await expect(page).toHaveURL(/\/uz\/seller$/);
  await expect(page.getByText('Sizda hali doʻkon yoʻq')).toBeVisible();

  await page.getByRole('link', { name: 'Doʻkon ochish' }).click();
  const slug = `e2e-${String(Date.now())}`;
  await page.getByLabel('Doʻkon nomi (oʻzbekcha)').fill('Sinov doʻkoni');
  await page.getByLabel('Doʻkon nomi (ruscha)').fill('Тестовый магазин');
  await page.getByLabel('Doʻkon manzili').fill(slug);
  await page.getByRole('combobox', { name: 'Viloyat' }).click();
  await page.getByRole('option', { name: 'Surxondaryo viloyati' }).click();
  await page.getByRole('combobox', { name: 'Tuman yoki shahar' }).click();
  await page.getByRole('option', { name: 'Termiz shahri' }).click();
  await page.getByLabel('Rasmiy nomi yoki F.I.Sh.').fill('YaTT Aliyev Ali');
  await page.getByLabel('STIR (INN)').fill('123456789');
  await page.getByLabel('Aloqa telefoni').fill('90 123 45 67');
  await page.getByRole('button', { name: 'Arizani yuborish' }).click();

  await expect(page).toHaveURL(/\/uz\/seller$/);
  const storeLink = page.getByRole('link', { name: /Sinov doʻkoni/ });
  await expect(storeLink).toContainText('Tekshiruvda');
  await storeLink.click();
  await expect(page.getByText('Ariza tekshirilmoqda.', { exact: false })).toBeVisible();

  await page.getByRole('link', { name: 'Yangi mahsulot' }).click();
  await page
    .getByLabel('Toifa', { exact: true })
    .selectOption({ label: 'Elektronika › Smartfonlar' });
  await page.getByLabel('Nomi (oʻzbekcha)').fill('Sinov telefoni');
  await page.getByLabel('Nomi (ruscha)').fill('Тестовый телефон');
  await page.getByLabel('Tavsif (oʻzbekcha)').fill('Yaxshi telefon');
  await page.getByLabel('Tavsif (ruscha)').fill('Хороший телефон');
  await page.getByRole('button', { name: 'Yaratish' }).click();

  await expect(page).toHaveURL(/\/uz\/seller\/[0-9a-f-]+\/products\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Sinov telefoni' })).toBeVisible();
  await expect(page.getByText('Qoralama').first()).toBeVisible();

  const addVariant = page.locator('form').filter({ hasText: 'Variant qoʻshish' });
  await addVariant.getByLabel('Artikul (SKU)').fill('E2E-1');
  await addVariant.getByLabel('Narx, soʻm', { exact: true }).fill('2 500 000');
  await addVariant.getByLabel('Qoldiq').fill('7');
  await addVariant.getByLabel('Rang').selectOption({ label: 'Qora' });
  await addVariant.getByRole('button', { name: 'Variant qoʻshish' }).click();
  await expect(page.getByText('E2E-1')).toBeVisible();
  await expect(page.getByText('2 500 000 soʻm')).toBeVisible();

  await page.locator('input[type=file]').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByRole('img', { name: 'Mahsulot rasmi 1' })).toBeVisible();

  // The store is still under review: submitting is refused with a clear message.
  await page.getByRole('button', { name: 'Tekshiruvga yuborish' }).click();
  await expect(page.getByText('Avval doʻkon tasdiqlanishi kerak.')).toBeVisible();
});

test('seller pages of a store the user does not belong to are not found', async ({
  page,
  request,
}) => {
  await page.goto('/uz/login');
  await loginOnPage(page, request);
  await expect(page).not.toHaveURL(/login/);
  const res = await page.goto('/uz/seller/01890000-0000-7000-8000-000000000000');
  expect(res?.status()).toBe(404);
  const bad = await page.goto('/uz/seller/not-a-uuid');
  expect(bad?.status()).toBe(404);
});
