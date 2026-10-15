import { expect, test } from '@playwright/test';
import { loginOnPage } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

test('online payment (simulated provider): checkout → payment page → paid order', async ({
  page,
  request,
}) => {
  await page.goto('/uz/p/kok-choy-100g');
  await page.getByRole('button', { name: 'Savatga' }).click();
  await expect(page.getByText('Savatga qoʻshildi')).toBeVisible();
  await page.goto('/uz/checkout');
  await expect(page).toHaveURL(/\/uz\/login/);
  await loginOnPage(page, request);
  await expect(page).toHaveURL(/\/uz\/checkout$/);

  await page.getByLabel('Qabul qiluvchi ismi').fill('Gʻayrat Maʼrufov');
  await page.getByRole('combobox', { name: 'Viloyat' }).click();
  await page.getByRole('option', { name: 'Surxondaryo viloyati' }).click();
  await page.getByRole('combobox', { name: 'Tuman yoki shahar' }).click();
  await page.getByRole('option', { name: 'Termiz shahri' }).click();
  await page.getByLabel('Koʻcha, uy, xonadon').fill('Alpomish koʻchasi, 12-uy');
  // No tariff for this district yet: the price is agreed with the seller.
  await expect(page.getByTestId('checkout-delivery')).toHaveText('Sotuvchi bilan kelishiladi');

  await page.getByLabel(/Test toʻlov \(DEV/).check();
  await expect(page.getByText(/daqiqa ichida toʻlanmasa, bekor qilinadi/)).toBeVisible();
  await page.getByRole('button', { name: 'Buyurtma berish' }).click();

  // The simulated provider page is clearly labelled as a test.
  await expect(page).toHaveURL(/\/uz\/pay\/dev\/UZ-\d{4}-\d{6}$/);
  await expect(page.getByRole('heading', { name: 'Test toʻlov' })).toBeVisible();
  await expect(page.getByText('haqiqiy pul yechilmaydi', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Toʻlovni tasdiqlash (sinov)' }).click();

  await expect(page).toHaveURL(/\/uz\/orders\/UZ-\d{4}-\d{6}$/);
  await expect(page.getByTestId('payment-status')).toHaveText('Toʻlangan');
  await expect(page.getByTestId('shipment-status').first()).toHaveText('Yangi');
});

test('an unpaid online order can be paid later or cancelled from its page', async ({
  page,
  request,
}) => {
  await page.goto('/uz/p/lagan-40sm');
  await page.getByRole('button', { name: 'Savatga' }).click();
  await expect(page.getByText('Savatga qoʻshildi')).toBeVisible();
  await page.goto('/uz/login?next=%2Fcheckout');
  await loginOnPage(page, request);
  await expect(page).toHaveURL(/\/uz\/checkout$/);
  await page.getByLabel('Qabul qiluvchi ismi').fill('Ali Valiyev');
  await page.getByRole('combobox', { name: 'Viloyat' }).click();
  await page.getByRole('option', { name: 'Surxondaryo viloyati' }).click();
  await page.getByRole('combobox', { name: 'Tuman yoki shahar' }).click();
  await page.getByRole('option', { name: 'Termiz shahri' }).click();
  await page.getByLabel('Koʻcha, uy, xonadon').fill('Alpomish koʻchasi, 12-uy');
  await page.getByLabel(/Test toʻlov \(DEV/).check();
  await page.getByRole('button', { name: 'Buyurtma berish' }).click();
  await expect(page).toHaveURL(/\/uz\/pay\/dev\//);

  // The provider reports a failure: the order stays unpaid and payable.
  await page.getByRole('button', { name: 'Toʻlov oʻtmadi (sinov)' }).click();
  await expect(page).toHaveURL(/\/uz\/orders\/UZ-/);
  await expect(page.getByTestId('payment-status')).toHaveText('Toʻlanmagan');
  await expect(page.getByRole('button', { name: 'Hozir toʻlash' })).toBeVisible();

  await page.getByRole('button', { name: 'Buyurtmani bekor qilish' }).click();
  await expect(page.getByText('Buyurtma bekor qilindi')).toBeVisible();
  await expect(page.getByTestId('payment-status')).toHaveText('Toʻlanmadi — bekor qilindi');
});
