import { expect, test } from '@playwright/test';
import { loginOnPage } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

test('guest cart → login (cart merged) → checkout → order split per store → cancel a shipment', async ({
  page,
  request,
}) => {
  for (const slug of ['kok-choy-100g', 'lagan-40sm']) {
    await page.goto(`/uz/p/${slug}`);
    await page.getByRole('button', { name: 'Savatga' }).click();
    await expect(page.getByText('Savatga qoʻshildi')).toBeVisible();
  }
  await page.goto('/uz/cart');
  await page.getByRole('link', { name: 'Rasmiylashtirish uchun kiring' }).click();
  await expect(page).toHaveURL(/\/uz\/login\?next=%2Fcheckout$/);
  await loginOnPage(page, request);

  await expect(page).toHaveURL(/\/uz\/checkout$/);
  await expect(page.getByTestId('checkout-total')).toHaveText('183 500 soʻm');
  await expect(page.getByText('Buyurtma 2 ta doʻkondan alohida yetkaziladi.')).toBeVisible();

  await page.getByLabel('Qabul qiluvchi ismi').fill('Gʻayrat Maʼrufov');
  await page.getByRole('combobox', { name: 'Viloyat' }).click();
  await page.getByRole('option', { name: 'Surxondaryo viloyati' }).click();
  await page.getByRole('combobox', { name: 'Tuman yoki shahar' }).click();
  await page.getByRole('option', { name: 'Termiz shahri' }).click();
  await page.getByLabel('Koʻcha, uy, xonadon').fill('Alpomish koʻchasi, 12-uy');
  await page.getByRole('button', { name: 'Buyurtma berish' }).click();

  await expect(page).toHaveURL(/\/uz\/orders\/UZ-\d{4}-\d{6}\?placed=1$/);
  await expect(page.getByText('Buyurtma qabul qilindi!')).toBeVisible();
  await expect(page.getByTestId('shipment-status')).toHaveCount(2);
  await expect(page.getByTestId('shipment-status').first()).toHaveText('Yangi');
  await expect(page.getByTestId('cart-count')).toHaveCount(0);

  await page.getByRole('button', { name: 'Bekor qilish' }).first().click();
  await expect(page.getByText('Buyurtma yangilandi')).toBeVisible();
  await expect(
    page.getByTestId('shipment-status').filter({ hasText: 'Bekor qilingan' }),
  ).toHaveCount(1);

  await page.goto('/uz/orders');
  await expect(page.getByRole('link', { name: /Buyurtma UZ-/ }).first()).toBeVisible();
});

test('checkout requires login', async ({ page }) => {
  await page.goto('/uz/checkout');
  await expect(page).toHaveURL(/\/uz\/login\?next=%2Fcheckout$/);
});
