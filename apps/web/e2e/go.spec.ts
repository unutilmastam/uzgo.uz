import { expect, type Page, test } from '@playwright/test';
import { grantRole, loginOnPage, randomLocalPhone, totp } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

const ORIGIN = 'http://localhost:3100';
/** Termiz: the rider waits here; "Navoiy" is ~1.2 km away (FakeGeocoder). */
const PICKUP = { latitude: 37.2242, longitude: 67.2783 };

const api = (page: Page) => ({
  get: (path: string) => page.request.get(`${ORIGIN}/api/v1${path}`),
  send: (method: 'post' | 'put', path: string, data?: unknown) =>
    page.request[method](`${ORIGIN}/api/v1${path}`, {
      headers: { Origin: ORIGIN },
      ...(data === undefined ? {} : { data }),
    }),
});

async function enrolTotp(page: Page) {
  const setup = await api(page).send('post', '/auth/totp/setup');
  expect(setup.ok()).toBe(true);
  const { secret } = (await setup.json()) as { secret: string };
  expect((await api(page).send('post', '/auth/totp/enable', { code: totp(secret) })).status()).toBe(
    204,
  );
}

test('UZGO Go: a driver applies → staff approve → a rider calls a car → the trip is completed', async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const plate = `${String(10 + Math.floor(Math.random() * 89))}A${String(100 + Math.floor(Math.random() * 899))}EE`;

  // 1. Someone applies to drive.
  const driverContext = await browser.newContext();
  const driver = await driverContext.newPage();
  await driver.goto('/uz/driver');
  await loginOnPage(driver, request);
  await expect(driver).toHaveURL(/\/uz\/driver$/);
  await driver.getByLabel('Ism', { exact: true }).fill('Bobur');
  await driver.getByLabel('Familiya').fill('Karimov');
  await driver.getByLabel('Haydovchilik guvohnomasi raqami').fill('AF 1234567');
  await driver.getByLabel('Marka').fill('Chevrolet');
  await driver.getByLabel('Model', { exact: true }).fill('Cobalt');
  await driver.getByLabel('Rang').fill('Oq');
  await driver.getByLabel('Ishlab chiqarilgan yil').fill('2021');
  await driver.getByLabel('Davlat raqami').fill(plate);
  const send = driver.getByRole('button', { name: 'Ariza yuborish' });
  await expect(send).toBeDisabled();
  await driver.getByRole('checkbox').check();
  await send.click();
  await expect(driver.getByTestId('driver-status')).toContainText('Koʻrib chiqilmoqda');

  // 2. Staff check the documents and approve.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminPhone = randomLocalPhone();
  await admin.goto('/uz/login');
  await loginOnPage(admin, request, adminPhone);
  await expect(admin).not.toHaveURL(/login/);
  await grantRole(request, adminPhone, 'ADMIN');
  await enrolTotp(admin);
  await admin.goto('/uz/admin/drivers');
  const card = admin.getByTestId('admin-driver').filter({ hasText: plate });
  await expect(card).toContainText('Bobur Karimov');
  await card.getByRole('button', { name: 'Tasdiqlash' }).click();
  await expect(card).toHaveCount(0);

  await driver.reload();
  await expect(driver.getByTestId('driver-status')).toContainText('Tasdiqlangan');
  // Driving happens in the app (driver mode); here the API stands in for it.
  const online = await api(driver).send('put', '/driver/status', {
    online: true,
    lat: PICKUP.latitude + 0.003,
    lng: PICKUP.longitude,
  });
  expect(online.ok()).toBe(true);

  // 3. A rider sets where from (GPS) and where to (search), sees the fixed price and calls.
  const riderContext = await browser.newContext({
    geolocation: PICKUP,
    permissions: ['geolocation'],
  });
  const rider = await riderContext.newPage();
  await rider.goto('/uz/go');
  await rider
    .getByTestId('pickup-picker')
    .getByRole('button', { name: 'Joylashuvimni aniqlash' })
    .click();
  await expect(rider.getByTestId('pickup-picker').getByTestId('point-label')).toBeVisible();
  const to = rider.getByTestId('dropoff-picker');
  await to.getByRole('textbox').fill('Navoiy koʻchasi');
  await to.getByRole('button', { name: 'Topish' }).click();
  await to.getByRole('button', { name: 'Navoiy koʻchasi, Termiz' }).click();
  const economy = rider.getByTestId('ride-class').filter({ hasText: 'Ekonom' });
  await expect(economy).toContainText('soʻm');
  await expect(economy).toContainText('haydovchi');
  await rider.getByRole('link', { name: 'Taksi chaqirish uchun kiring' }).click();
  await loginOnPage(rider, request);
  await expect(rider).toHaveURL(/\/uz\/go$/);
  await rider.getByRole('combobox', { name: 'Viloyat' }).click();
  await rider.getByRole('option', { name: 'Surxondaryo viloyati' }).click();
  await rider.getByRole('combobox', { name: 'Tuman yoki shahar' }).click();
  await rider.getByRole('option', { name: 'Termiz shahri' }).click();
  await rider.getByLabel('Haydovchiga izoh').fill('Darvoza oldida');
  await rider.getByRole('button', { name: /^Taksi chaqirish/ }).click();
  await expect(rider).toHaveURL(/\/uz\/go\/UZ-\d{4}-\d{6}$/);
  const number = new URL(rider.url()).pathname.split('/').pop() ?? '';
  await expect(rider.getByTestId('ride-status')).toHaveText('Haydovchi qidirilmoqda');

  // 4. The driver takes it (first driver wins) and drives.
  const offers = (await (await api(driver).get('/driver/offers')).json()) as {
    items: { id: string; number: string; rider: unknown }[];
  };
  const offer = offers.items.find((o) => o.number === number);
  expect(offer?.rider).toBeNull();
  const id = offer?.id ?? '';
  expect((await api(driver).send('post', `/driver/offers/${id}/accept`)).ok()).toBe(true);

  await rider.reload();
  await expect(rider.getByTestId('ride-status')).toHaveText('Haydovchi yoʻlda');
  await expect(rider.getByTestId('ride-plate')).toHaveText(plate);
  await expect(rider.getByTestId('ride-driver')).toContainText('Oq Chevrolet Cobalt');

  for (const action of ['ARRIVED', 'START', 'COMPLETE']) {
    expect((await api(driver).send('post', `/driver/rides/${id}/action`, { action })).ok()).toBe(
      true,
    );
  }
  await rider.reload();
  await expect(rider.getByTestId('ride-status')).toHaveText('Safar yakunlandi');
  await expect(rider.getByRole('button', { name: 'Safarni bekor qilish' })).toHaveCount(0);

  await rider.goto('/uz/go');
  await expect(rider.getByTestId('ride-history-item').first()).toContainText('Safar yakunlandi');

  // 5. Staff see the ride.
  await admin.goto('/uz/admin/rides');
  await expect(admin.getByTestId('admin-ride').filter({ hasText: number })).toContainText(
    'Safar yakunlandi',
  );

  await api(driver).send('put', '/driver/status', { online: false });
  await Promise.all([driverContext.close(), adminContext.close(), riderContext.close()]);
});
