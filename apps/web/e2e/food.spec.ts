import { expect, type Page, test } from '@playwright/test';
import { grantRole, loginOnPage, randomLocalPhone, totp } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

const ORIGIN = 'http://localhost:3100';
/** Termiz: the restaurant, and the customer ~0.5 km away. */
const RESTAURANT = { lat: 37.2242, lng: 67.2783 };
const HOME = { latitude: 37.2286, longitude: 67.2756 };

async function enrolTotp(page: Page) {
  const call = (path: string, data?: unknown) =>
    page.request.post(`${ORIGIN}/api/v1${path}`, {
      headers: { Origin: ORIGIN },
      ...(data === undefined ? {} : { data }),
    });
  const setup = await call('/auth/totp/setup');
  expect(setup.ok()).toBe(true);
  const { secret } = (await setup.json()) as { secret: string };
  expect((await call('/auth/totp/enable', { code: totp(secret) })).status()).toBe(204);
}

test('UZGO Food: staff add a restaurant → customer orders near home → kitchen delivers', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const stamp = String(Date.now()).slice(-7);

  // The future owner signs in once.
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await owner.goto('/uz/login');
  const ownerPhone = await loginOnPage(owner, request);
  await expect(owner).not.toHaveURL(/login/);

  // 1. Admin adds the restaurant and its menu.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminPhone = randomLocalPhone();
  await admin.goto('/uz/login');
  await loginOnPage(admin, request, adminPhone);
  await expect(admin).not.toHaveURL(/login/);
  await grantRole(request, adminPhone, 'ADMIN');
  await enrolTotp(admin);

  await admin.goto('/uz/admin/restaurants');
  const name = `E2E oshxona ${stamp}`;
  await admin.getByLabel('Nomi (oʻzbekcha)').fill(name);
  await admin.getByLabel('Nomi (ruscha)').fill(`E2E кафе ${stamp}`);
  await admin.getByLabel('Manzil (URL)').fill(`e2e-osh-${stamp}`);
  await admin.getByLabel('Egasining telefoni').fill(ownerPhone);
  await admin.getByRole('combobox', { name: 'Viloyat' }).click();
  await admin.getByRole('option', { name: 'Surxondaryo viloyati' }).click();
  await admin.getByRole('combobox', { name: 'Tuman yoki shahar' }).click();
  await admin.getByRole('option', { name: 'Termiz shahri' }).click();
  await admin.getByLabel('Restoran manzili').fill('Alpomish koʻchasi, 1');
  await admin.getByLabel('Kenglik (lat)').fill(String(RESTAURANT.lat));
  await admin.getByLabel('Uzunlik (lng)').fill(String(RESTAURANT.lng));
  await admin.getByLabel('Kim yetkazadi').selectOption('SELF');
  await admin.getByLabel('Restoranning yetkazish narxi, soʻm').fill('5000');
  await admin.getByLabel('Ochiladi').fill('00:00');
  await admin.getByLabel('Yopiladi').fill('00:00');
  await admin.getByRole('button', { name: 'Restoran qoʻshish' }).click();
  await expect(admin).toHaveURL(/\/uz\/admin\/restaurants\/[0-9a-f-]{36}$/);
  await expect(admin.getByRole('heading', { name })).toBeVisible();

  await admin.getByLabel('Boʻlim (oʻzbekcha)').fill('Milliy taomlar');
  await admin.getByLabel('Boʻlim (ruscha)').fill('Национальные блюда');
  await admin.getByRole('button', { name: 'Boʻlim qoʻshish' }).click();
  await expect(admin.getByRole('button', { name: 'Taom qoʻshish' })).toBeVisible();
  await admin.getByLabel('Taom (oʻzbekcha)').fill('Toʻy oshi');
  await admin.getByLabel('Taom (ruscha)').fill('Свадебный плов');
  await admin.getByLabel('Narxi, soʻm', { exact: true }).fill('35000');
  await admin.getByRole('button', { name: 'Taom qoʻshish' }).click();
  await expect(admin.getByTestId('admin-dish').filter({ hasText: 'Toʻy oshi' })).toBeVisible();

  // 2. A customer at home finds it, fills a basket and orders (cash).
  const buyerContext = await browser.newContext({
    geolocation: HOME,
    permissions: ['geolocation'],
  });
  const buyer = await buyerContext.newPage();
  await buyer.goto('/uz/food');
  await buyer.getByRole('button', { name: 'Joylashuvimni aniqlash' }).click();
  await expect(buyer.getByTestId('point-label')).toBeVisible();
  const card = buyer.getByTestId('restaurant-card').filter({ hasText: name });
  await expect(card).toContainText('5 000');
  await card.click();
  await expect(buyer.getByRole('heading', { name })).toBeVisible();
  await buyer.getByRole('button', { name: 'Toʻy oshi — savatga qoʻshish' }).click();
  await buyer.getByRole('button', { name: 'Toʻy oshi — bittaga koʻpaytirish' }).click();
  await expect(buyer.getByTestId('food-total')).toContainText('75 000');
  await buyer.getByRole('link', { name: 'Buyurtma berish uchun kiring' }).click();
  await loginOnPage(buyer, request);
  await expect(buyer).toHaveURL(new RegExp(`/uz/food/e2e-osh-${stamp}$`));
  await expect(buyer.getByTestId('food-total')).toContainText('75 000');
  await buyer.getByLabel('Uy, podyezd, qavat, xonadon').fill('Alpomish 5, 12-xonadon');
  await buyer.getByLabel('Qabul qiluvchi ismi').fill('Dilnoza');
  await buyer.getByRole('button', { name: 'Buyurtma berish', exact: true }).click();
  await expect(buyer).toHaveURL(/\/uz\/orders\/UZ-\d{4}-\d{6}\?placed=1$/);
  const orderPath = new URL(buyer.url()).pathname;
  await expect(buyer.getByTestId('food-tracking')).toContainText('Restoran tasdigʻini kutmoqda');

  // 3. The kitchen works the order in its panel.
  await owner.goto('/uz/seller');
  await owner.getByRole('link', { name: new RegExp(name) }).click();
  await expect(owner).toHaveURL(/\/uz\/restaurant\/[0-9a-f-]{36}$/);
  const ticket = owner.getByTestId('restaurant-order').first();
  await expect(ticket).toContainText('Toʻy oshi × 2');
  await expect(ticket).toContainText('Alpomish 5, 12-xonadon');
  for (const [button, status] of [
    ['Qabul qilish', 'Tayyorlanmoqda'],
    ['Tayyor', 'Tayyor, olib ketishni kutmoqda'],
    ['Yoʻlga chiqdi', 'Yoʻlda'],
  ] as const) {
    await ticket.getByRole('button', { name: button, exact: true }).click();
    await expect(ticket).toContainText(status);
  }
  await ticket.getByRole('button', { name: 'Yetkazildi', exact: true }).click();
  await expect(owner.getByText('Hozircha buyurtma yoʻq.')).toBeVisible();

  await buyer.goto(orderPath);
  await expect(buyer.getByTestId('shipment-status')).toHaveText('Yetkazildi');

  // 4. Staff add a courier.
  await admin.goto('/uz/admin/couriers');
  await admin.getByLabel('Kuryer telefoni').fill(ownerPhone);
  await admin.getByRole('button', { name: 'Qoʻshish', exact: true }).click();
  await expect(admin.getByTestId('admin-courier').first()).toBeVisible();

  await Promise.all([ownerContext.close(), adminContext.close(), buyerContext.close()]);
});
