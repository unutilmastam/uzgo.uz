import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUri,
  timeStep,
  totpCode,
  verifyTotp,
} from './totp.js';

describe('TOTP (RFC 6238)', () => {
  const rfcSecret = Buffer.from('12345678901234567890');

  it('matches the RFC 6238 SHA-1 test vectors (last 6 digits)', () => {
    const vectors: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];
    for (const [seconds, code] of vectors) {
      expect(totpCode(rfcSecret, Math.floor(seconds / 30))).toBe(code);
    }
  });

  it('round-trips base32', () => {
    const bytes = randomBytes(20);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('accepts ±1 step and refuses replays and garbage', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = timeStep(now);
    const code = totpCode(base32Decode(secret), step);
    expect(verifyTotp(secret, code, { now })).toBe(step);
    expect(verifyTotp(secret, totpCode(base32Decode(secret), step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(base32Decode(secret), step - 2), { now })).toBeNull();
    expect(verifyTotp(secret, code, { now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(secret, '12345', { now })).toBeNull();
    expect(verifyTotp(secret, 'abcdef', { now })).toBeNull();
  });

  it('builds an otpauth URI', () => {
    expect(otpauthUri('ABC', '+99890*****67')).toBe(
      'otpauth://totp/UZGO%3A%2B99890*****67?secret=ABC&issuer=UZGO&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('encrypts secrets with AES-256-GCM and detects tampering', () => {
    const key = randomBytes(32);
    const sealed = encryptSecret('SECRET', key);
    expect(sealed).not.toContain('SECRET');
    expect(decryptSecret(sealed, key)).toBe('SECRET');
    expect(() => decryptSecret(sealed, randomBytes(32))).toThrow();
    const [iv, tag, data] = sealed.split('.');
    const bytes = Buffer.from(data ?? '', 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    expect(() => decryptSecret([iv, tag, bytes.toString('base64url')].join('.'), key)).toThrow();
  });
});
