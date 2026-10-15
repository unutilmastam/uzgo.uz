import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';

/** Minimal RFC 6265 cookie parser (first value wins, malformed pairs ignored). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name === '') continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(name in cookies)) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        // Ignore undecodable values.
      }
    }
  }
  return cookies;
}

/** Client IP as resolved by Express (honours the explicit TRUST_PROXY setting). */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Header the web server uses to prove a server-to-server call (ADR 0020). */
export const INTERNAL_TOKEN_HEADER = 'x-uzgo-internal-token';
/** Visitor IP the web server forwards with an internal call. */
export const FORWARDED_CLIENT_IP_HEADER = 'x-uzgo-client-ip';

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

/** Constant-time check of the internal token (false when none is configured). */
export function isInternalCall(req: Request, token: string | undefined): boolean {
  const given = headerValue(req, INTERNAL_TOKEN_HEADER);
  if (!token || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rate-limit key. Server-side rendering calls arrive from the web container,
 * so without this every visitor would share one bucket: a call carrying the
 * internal token is counted against the visitor IP it forwards (or one shared
 * "web" bucket for cached public data). Anyone else is keyed by their own IP;
 * a forged client-IP header without the token is ignored.
 */
export function rateLimitTracker(req: Request, token: string | undefined): string {
  if (isInternalCall(req, token)) {
    const forwarded = headerValue(req, FORWARDED_CLIENT_IP_HEADER)?.trim();
    return forwarded && isIP(forwarded) ? forwarded : 'internal:web';
  }
  return clientIp(req);
}
