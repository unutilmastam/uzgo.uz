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
