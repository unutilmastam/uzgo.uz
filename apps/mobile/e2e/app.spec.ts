import { expect, test } from '@playwright/test';
import { apiUser, liveProduct, loginInApp, randomLocalPhone, signedInPage } from './helpers';

test('buyer: browse → cart as guest → login (cart kept) → checkout → order', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.getByText('Siz uchun tavsiyalar')).toBeVisible();

  await page.goto('/product/kok-choy-100g');
  await expect(page.getByRole('heading', { name: /Koʻk choy/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/product.png' });
  await page.getByRole('button', { name: 'Savatga' }).click();
  await expect(page.getByText('Savatga qoʻshildi')).toBeVisible();
  await page.getByRole('button', { name: 'Savatga oʻtish' }).click();

  await expect(page.getByText('1 ta mahsulot')).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/cart.png' });
  await page.getByRole('button', { name: 'Rasmiylashtirish uchun kiring' }).click();
  await loginInApp(page, request, randomLocalPhone());

  // After login the app goes on to checkout with the guest cart merged.
  await expect(page.getByText('Buyurtmani rasmiylashtirish').first()).toBeVisible();
  await page.getByLabel('Qabul qiluvchi ismi').fill('Gʻayrat Maʼrufov');
  await page.getByRole('button', { name: /^Viloyat/ }).click();
  await page.getByRole('radio', { name: 'Surxondaryo viloyati' }).click();
  await page.getByRole('button', { name: /^Tuman yoki shahar/ }).click();
  await page.getByRole('radio', { name: 'Termiz shahri' }).click();
  await page.getByLabel('Koʻcha, uy, xonadon').fill('Alpomish koʻchasi, 12-uy');
  await page.screenshot({ path: 'test-results/screenshots/checkout.png', fullPage: true });
  await page.getByRole('button', { name: 'Buyurtma berish' }).click();

  await expect(page.getByText('Buyurtma qabul qilindi!')).toBeVisible();
  await expect(page.getByText('Yangi').first()).toBeVisible();
  await expect(page.getByText('Qabul qilishda toʻlanadi')).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/order.png', fullPage: true });
});

test('seller: shipments of my store → accept → tracking → deliver', async ({ page, request }) => {
  test.setTimeout(120_000);
  const { seller, title, variantId } = await liveProduct(request);

  // A customer orders the product through the API.
  const buyer = await apiUser(request);
  await buyer.call('post', '/cart/items', { variantId, quantity: 1 });
  const regions = (await buyer.call('get', '/geo/regions')) as {
    items: { id: string; code: string }[];
  };
  const districts = (await buyer.call(
    'get',
    `/geo/regions/${regions.items.find((r) => r.code === 'UZ-SU')?.id ?? ''}/districts`,
  )) as { items: { id: string }[] };
  const districtId = districts.items[0]?.id ?? '';
  const quote = (await buyer.call('get', `/delivery/quote?districtId=${districtId}`)) as {
    totalTiyin: string;
  };
  await buyer.call('post', '/checkout', {
    recipientName: 'Ali Valiyev',
    recipientPhone: '+998901234567',
    districtId,
    addressLine: 'Navoiy koʻchasi, 5',
    paymentMethod: 'CASH_ON_DELIVERY',
    expectedTotalTiyin: quote.totalTiyin,
  });

  // The seller works in the app.
  await signedInPage(page, seller.token);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sotuvchi paneli' }).click();
  await page.getByRole('link', { name: /Mobil doʻkon/ }).click();
  await expect(page.getByText(title).first()).toBeVisible();
  await expect(page.getByText('Ali Valiyev, +998 90 123 45 67')).toBeVisible();

  await page.screenshot({ path: 'test-results/screenshots/seller.png', fullPage: true });
  await page.getByRole('button', { name: 'Qabul qilish' }).click();
  await expect(page.getByText('Sotuvchi qabul qildi')).toBeVisible();
  await page.getByLabel('Yetkazib beruvchi').fill('BTS Express');
  await page.getByLabel('Kuzatuv kodi').fill('BTS-777');
  await page.getByRole('button', { name: 'Kuzatuvni saqlash' }).click();
  await expect(page.getByText('Saqlandi')).toBeVisible();
  await page.getByRole('button', { name: 'Qadoqlandi' }).click();
  await page.getByRole('button', { name: 'Yetkazishga topshirish' }).click();
  await expect(page.getByText('Yetkazishga topshirildi')).toBeVisible();

  // "Delivered" is confirmed first.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Yetkazildi' }).click();
  await page.getByRole('button', { name: 'Hammasi' }).click();
  await expect(page.getByText('Yetkazildi')).toBeVisible();
});
