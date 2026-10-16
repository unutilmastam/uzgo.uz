import { expect, test } from '@playwright/test';
import {
  API as API_ROOT,
  apiUser,
  HOME_POINT,
  liveProduct,
  liveRestaurant,
  loginInApp,
  randomLocalPhone,
  signedInPage,
  staffAdmin,
} from './helpers';

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

test('buyer after delivery: rating, review and a return request in the app', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const { seller, product, title, variantId } = await liveProduct(request);
  const buyer = await apiUser(request);
  await buyer.call('patch', '/users/me', { firstName: 'Dilnoza', lastName: 'Karimova' });
  await buyer.call('post', '/cart/items', { variantId, quantity: 1 });
  const regions = (await buyer.call('get', '/geo/regions')) as {
    items: { id: string; code: string }[];
  };
  const districts = (await buyer.call(
    'get',
    `/geo/regions/${regions.items.find((r) => r.code === 'UZ-SU')?.id ?? ''}/districts`,
  )) as { items: { id: string }[] };
  const districtId = districts.items[0]?.id ?? '';
  // An unknown promo code is reported by the quote, not silently ignored.
  const quote = (await buyer.call(
    'get',
    `/delivery/quote?districtId=${districtId}&promoCode=NO-SUCH-CODE`,
  )) as { totalTiyin: string; promoError: string | null };
  expect(quote.promoError).toBe('PROMO_INVALID');
  const { order } = (await buyer.call('post', '/checkout', {
    recipientName: 'Dilnoza Karimova',
    recipientPhone: '+998901234567',
    districtId,
    addressLine: 'Navoiy koʻchasi, 5',
    paymentMethod: 'CASH_ON_DELIVERY',
    expectedTotalTiyin: quote.totalTiyin,
  })) as { order: { number: string; sellerOrders: { id: string }[] } };
  for (const to of ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED']) {
    await seller.call(
      'post',
      `/seller/seller-orders/${order.sellerOrders[0]?.id ?? ''}/transition`,
      {
        to,
      },
    );
  }

  await signedInPage(page, buyer.token);
  await page.goto(`/product/${product.slug}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Sharh yozish' }).click();
  await page.getByRole('radio', { name: '4 yulduz' }).click();
  await page.getByLabel('Sharh (ixtiyoriy)').fill('Yaxshi, lekin qadoq oddiy');
  await page.getByRole('button', { name: 'Yuborish' }).click();
  await expect(page.getByText('Sizning sharhingiz')).toBeVisible();
  await expect(page.getByTestId('review').first()).toContainText('Dilnoza K.');
  await expect(page.getByTestId('product-rating')).toContainText('4.0');

  await page.goto(`/order/${order.number}`);
  await expect(page.getByTestId('return-info')).toContainText('gacha soʻrash mumkin');
  await page.getByRole('button', { name: 'Qaytarishni soʻrash' }).click();
  await page.getByRole('radio', { name: 'Yetkazishda shikastlangan' }).click();
  await page.getByLabel('Muammoni tasvirlang').fill('Quti ezilib kelgan');
  await page.getByRole('button', { name: 'Qaytarishni soʻrash' }).click();
  await expect(page.getByText('Qaytarish soʻralgan').first()).toBeVisible();
  await expect(page.getByTestId('return-info')).toContainText('Quti ezilib kelgan');
  await page.screenshot({ path: 'test-results/screenshots/return.png', fullPage: true });
});

test.describe('UZGO Food in the app', () => {
  test.use({ geolocation: HOME_POINT, permissions: ['geolocation'] });

  test('customer orders near home; a UZGO courier takes, picks up and delivers', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(150_000);
    const r = await liveRestaurant(request);
    const customer = await apiUser(request);
    await customer.call('patch', '/users/me', { firstName: 'Dilnoza' });
    const courier = await apiUser(request);
    await r.admin.call('post', '/admin/couriers', { phone: `+998${courier.localPhone}` });

    // Customer: home → Food → location → restaurant → basket → order.
    await signedInPage(page, customer.token);
    await page.goto('/');
    await page.getByTestId('food-entry').click();
    await page.getByRole('button', { name: 'Joylashuvimni aniqlash' }).click();
    await expect(page.getByTestId('food-point')).not.toHaveText(/Joylashuvni aniqlang/);
    await page.getByRole('link', { name: r.name }).click();
    await page.getByRole('button', { name: 'Toʻy oshi — savatga qoʻshish' }).click();
    await page.getByLabel('Uy, podyezd, qavat, xonadon').fill('Alpomish 5, 12-xonadon');
    await page.getByRole('button', { name: 'Buyurtma berish' }).click();
    await expect(page.getByTestId('food-status')).toHaveText('Restoran tasdigʻini kutmoqda');
    await page.screenshot({ path: 'test-results/screenshots/food-order.png', fullPage: true });
    const number = /UZ-\d{4}-\d{6}/.exec(decodeURIComponent(page.url()))?.[0] ?? '';
    expect(number).not.toBe('');

    // The kitchen accepts (API); the courier works in the app.
    const orders = (await r.owner.call('get', `/restaurant/${r.storeId}/orders`)) as {
      items: { id: string }[];
    };
    const shipmentId = orders.items[0]?.id ?? '';
    await r.owner.call('post', `/seller/seller-orders/${shipmentId}/transition`, {
      to: 'ACCEPTED',
    });

    const courierPage = await context.newPage();
    await signedInPage(courierPage, courier.token);
    await courierPage.goto('/account');
    await courierPage.getByTestId('courier-mode').click();
    await courierPage.getByTestId('courier-toggle').click();
    await expect(courierPage.getByText('Yaqin takliflar')).toBeVisible();
    const offer = courierPage.getByTestId('take-offer').first();
    await expect(offer).toBeVisible({ timeout: 15_000 });
    await offer.click();
    await expect(courierPage.getByText('Mening buyurtmalarim')).toBeVisible();
    await expect(courierPage.getByText('Dilnoza')).toBeVisible();
    await r.owner.call('post', `/seller/seller-orders/${shipmentId}/transition`, { to: 'PACKED' });
    await courierPage.reload();
    await courierPage.getByRole('button', { name: 'Oldim, yoʻldaman' }).click();
    await courierPage.getByRole('button', { name: 'Yetkazdim' }).click();
    await expect(courierPage.getByText('Mening buyurtmalarim')).toHaveCount(0);
    await courierPage.screenshot({ path: 'test-results/screenshots/courier.png', fullPage: true });

    await page.goto(`/order/${number}`);
    await expect(page.getByTestId('food-status')).toHaveText('Yetkazildi');
  });
});

test.describe('UZGO Go in the app', () => {
  test.use({ geolocation: HOME_POINT, permissions: ['geolocation'] });

  test('rider calls a car at a fixed price; an approved driver takes and completes the ride', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(150_000);
    const admin = await staffAdmin(request);
    const regions = (await (await request.get(`${API_ROOT}/geo/regions`)).json()) as {
      items: { id: string; code: string }[];
    };
    const region = regions.items.find((r) => r.code === 'UZ-SU');
    const districts = (await (
      await request.get(`${API_ROOT}/geo/regions/${region?.id ?? ''}/districts`)
    ).json()) as { items: { id: string; name: { uz: string } }[] };
    const districtId = districts.items.find((d) => d.name.uz === 'Termiz shahri')?.id ?? '';
    expect(districtId).not.toBe('');

    const rider = await apiUser(request);
    await rider.call('patch', '/users/me', { firstName: 'Madina', districtId });
    const driver = await apiUser(request);
    const plate = `${String(10 + Math.floor(Math.random() * 89))}A${String(100 + Math.floor(Math.random() * 899))}MM`;
    await driver.call('put', '/driver/application', {
      firstName: 'Sardor',
      lastName: 'Aliyev',
      licenceNumber: 'AB7654321',
      carMake: 'Chevrolet',
      carModel: 'Nexia',
      carColor: 'Kulrang',
      carYear: 2019,
      plateNumber: plate,
      acceptTerms: true,
    });
    await admin.call('post', `/admin/drivers/${driver.userId}/review`, { decision: 'APPROVE' });

    // Rider: home → Go → from (GPS) → to (search) → price → call.
    await signedInPage(page, rider.token);
    await page.goto('/');
    await page.getByTestId('go-entry').click();
    await page.getByRole('button', { name: 'Joylashuvimni aniqlash' }).click();
    await expect(page.getByTestId('pickup-point')).not.toHaveText(/Joylashuvingizni aniqlang/);
    await page.getByLabel('Manzil qidirish').nth(1).fill('Navoiy koʻchasi');
    await page.getByRole('button', { name: 'Topish' }).nth(1).click();
    await page.getByRole('button', { name: 'Navoiy koʻchasi, Termiz' }).click();
    await expect(page.getByTestId('dropoff-point')).toHaveText('Navoiy koʻchasi, Termiz');
    await expect(page.getByTestId('ride-distance')).toContainText('km');
    await page.getByTestId('call-ride').click();
    await expect(page.getByTestId('ride-status')).toHaveText('Haydovchi qidirilmoqda');
    await page.screenshot({ path: 'test-results/screenshots/ride-request.png', fullPage: true });
    const number = /UZ-\d{4}-\d{6}/.exec(decodeURIComponent(page.url()))?.[0] ?? '';
    expect(number).not.toBe('');

    // Driver: cabinet → driver mode → online → take → arrive → start → complete.
    const driverPage = await context.newPage();
    await signedInPage(driverPage, driver.token);
    await driverPage.goto('/account');
    await driverPage.getByTestId('driver-mode').click();
    await driverPage.getByTestId('driver-toggle').click();
    await expect(driverPage.getByText('Yaqin buyurtmalar')).toBeVisible();
    const take = driverPage.getByTestId('take-ride').first();
    await expect(take).toBeVisible({ timeout: 15_000 });
    await take.click();
    await expect(driverPage.getByText('Joriy safar')).toBeVisible();
    await expect(driverPage.getByText('Madina')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('ride-status')).toHaveText('Haydovchi yoʻlda');
    await expect(page.getByTestId('ride-plate')).toHaveText(plate);

    await driverPage.getByRole('button', { name: 'Yetib keldim' }).click();
    await driverPage.getByRole('button', { name: 'Safarni boshlash' }).click();
    await driverPage.getByRole('button', { name: 'Safarni yakunlash' }).click();
    await expect(driverPage.getByText('Joriy safar')).toHaveCount(0);
    await driverPage.screenshot({ path: 'test-results/screenshots/driver.png', fullPage: true });
    await driverPage.getByTestId('driver-toggle').click();

    await page.reload();
    await expect(page.getByTestId('ride-status')).toHaveText('Safar yakunlandi');
  });
});
