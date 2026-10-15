import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { parseCookies, rateLimitTracker } from './http.js';

describe('parseCookies', () => {
  it('parses, decodes and keeps the first value', () => {
    expect(parseCookies('a=1; b=hello%20world; a=2; bad; =x; c="q"')).toEqual({
      a: '1',
      b: 'hello world',
      c: 'q',
    });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('x=%E0%A4%A')).toEqual({});
  });
});

describe('rateLimitTracker', () => {
  const token = 'internal-token-'.padEnd(40, 'x');
  const req = (headers: Record<string, string>) =>
    ({ headers, ip: '10.0.0.5', socket: {} }) as unknown as Request;

  it('uses the forwarded visitor IP only with the internal token', () => {
    const forwarded = { 'x-uzgo-client-ip': '203.0.113.7' };
    expect(rateLimitTracker(req({ ...forwarded, 'x-uzgo-internal-token': token }), token)).toBe(
      '203.0.113.7',
    );
    expect(rateLimitTracker(req(forwarded), token)).toBe('10.0.0.5');
    expect(rateLimitTracker(req({ ...forwarded, 'x-uzgo-internal-token': 'wrong' }), token)).toBe(
      '10.0.0.5',
    );
    expect(rateLimitTracker(req({ ...forwarded, 'x-uzgo-internal-token': token }), undefined)).toBe(
      '10.0.0.5',
    );
  });

  it('puts internal calls without a valid visitor IP in one web bucket', () => {
    expect(rateLimitTracker(req({ 'x-uzgo-internal-token': token }), token)).toBe('internal:web');
    expect(
      rateLimitTracker(
        req({ 'x-uzgo-internal-token': token, 'x-uzgo-client-ip': 'not-an-ip' }),
        token,
      ),
    ).toBe('internal:web');
  });
});
