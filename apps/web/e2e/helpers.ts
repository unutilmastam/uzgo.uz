import { type APIRequestContext, expect, type Page } from '@playwright/test';

export const API = 'http://localhost:4000/api/v1';

export function randomLocalPhone(): string {
  return `90${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

export async function lastOtp(request: APIRequestContext, localPhone: string): Promise<string> {
  const res = await request.get(`${API}/__test__/last-otp?phone=%2B998${localPhone}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { code: string }).code;
}

/** Completes the OTP login form that is currently open (uz locale). */
export async function loginOnPage(
  page: Page,
  request: APIRequestContext,
  localPhone = randomLocalPhone(),
) {
  await page.getByLabel('Telefon raqami').fill(localPhone);
  await page.getByRole('button', { name: 'Kodni olish' }).click();
  await expect(page.getByLabel('Tasdiqlash kodi')).toBeVisible();
  await page.getByLabel('Tasdiqlash kodi').fill(await lastOtp(request, localPhone));
  return localPhone;
}
