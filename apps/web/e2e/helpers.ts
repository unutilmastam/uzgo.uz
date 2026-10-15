import { createHmac } from 'node:crypto';
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

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — what an authenticator app shows. */
export function totp(secretBase32: string, offsetSteps = 0): string {
  let bits = '';
  for (const char of secretBase32.replace(/=+$/, '')) {
    bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const hmac = createHmac('sha1', bytes).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** Test-only API (NODE_ENV=test + fake SMS): grants a staff role to a signed-up phone. */
export async function grantRole(
  request: APIRequestContext,
  localPhone: string,
  role: 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN',
) {
  const res = await request.post(`${API}/__test__/grant-role`, {
    data: { phone: `+998${localPhone}`, role },
  });
  expect(res.status()).toBe(204);
}
