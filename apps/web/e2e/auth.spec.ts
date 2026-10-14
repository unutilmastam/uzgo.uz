import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

const API = 'http://localhost:4000/api/v1';

function randomLocalPhone(): string {
  return `90${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

async function lastOtp(request: APIRequestContext, localPhone: string): Promise<string> {
  const res = await request.get(`${API}/__test__/last-otp?phone=%2B998${localPhone}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { code: string }).code;
}

async function requestCode(page: Page, localPhone: string) {
  await page.getByLabel('Telefon raqami').fill(localPhone);
  await page.getByRole('button', { name: 'Kodni olish' }).click();
  await expect(page.getByLabel('Tasdiqlash kodi')).toBeVisible();
}

test.describe('phone + OTP login', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test('protected account page → login → profile → logout', async ({ page, request }) => {
    await page.goto('/uz/account');
    await expect(page).toHaveURL(/\/uz\/login\?next=%2Faccount$/);

    const phone = randomLocalPhone();
    await requestCode(page, phone);
    await page.getByLabel('Tasdiqlash kodi').fill(await lastOtp(request, phone));

    await expect(page).toHaveURL(/\/uz\/account$/);
    await expect(page.getByTestId('account-phone')).toHaveText(
      `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7)}`,
    );
    await expect(page.getByText('Xaridor', { exact: true })).toBeVisible();

    await page.getByLabel('Ism').fill('Gʻayrat');
    await page.getByLabel('Familiya').fill('Maʼrufov');
    await page.getByRole('combobox', { name: 'Viloyat' }).click();
    await page.getByRole('option', { name: 'Surxondaryo viloyati' }).click();
    await page.getByRole('combobox', { name: 'Tuman yoki shahar' }).click();
    await page.getByRole('option', { name: 'Termiz shahri' }).click();
    await page.getByRole('button', { name: 'Saqlash' }).click();
    await expect(page.getByText('Maʼlumotlar saqlandi')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Salom, Gʻayrat Maʼrufov!')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Tuman yoki shahar' })).toContainText(
      'Termiz shahri',
    );

    await page.getByRole('button', { name: 'Chiqish', exact: true }).click();
    await expect(page).toHaveURL(/\/uz\/login$/);
    await page.goto('/uz/account');
    await expect(page).toHaveURL(/\/uz\/login\?next=%2Faccount$/);
  });

  test('a wrong code shows an error and keeps the user logged out', async ({ page, request }) => {
    await page.goto('/ru/login');
    const phone = randomLocalPhone();
    await page.getByLabel('Номер телефона').fill(phone);
    await page.getByRole('button', { name: 'Получить код' }).click();
    await expect(page.getByLabel('Код подтверждения')).toBeVisible();
    const code = await lastOtp(request, phone);
    const wrong = code === '000000' ? '111111' : '000000';
    await page.getByLabel('Код подтверждения').fill(wrong);
    await expect(page.getByRole('alert').filter({ hasText: 'Неверный' })).toHaveText(
      'Неверный или устаревший код.',
    );
    await page.goto('/ru/account');
    await expect(page).toHaveURL(/\/ru\/login/);
  });

  test('login page has no accessibility violations', async ({ page }) => {
    await page.goto('/uz/login');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
