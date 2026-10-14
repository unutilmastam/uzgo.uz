import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — the format every authenticator app supports. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET.charAt((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(now: number = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCode(secret: Buffer, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', secret).update(counter).digest();
  const offset = (hash[hash.length - 1] ?? 0) & 0x0f;
  const binary = (hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, '0');
}

/**
 * Returns the matching time step (current ±1 for clock drift), or null.
 * Steps at or before `lastUsedStep` are refused so a code cannot be replayed.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { now?: number; lastUsedStep?: number | null } = {},
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = timeStep(options.now);
  for (const step of [current - 1, current, current + 1]) {
    if (
      options.lastUsedStep !== undefined &&
      options.lastUsedStep !== null &&
      step <= options.lastUsedStep
    )
      continue;
    if (totpCode(secret, step) === code) return step;
  }
  return null;
}

export function otpauthUri(secretBase32: string, account: string): string {
  const label = encodeURIComponent(`UZGO:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=UZGO&algorithm=SHA1&digits=6&period=${String(TOTP_PERIOD_SECONDS)}`;
}

/** AES-256-GCM: "iv.tag.ciphertext" (base64url). */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(sealed: string, key: Buffer): string {
  const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Invalid sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
