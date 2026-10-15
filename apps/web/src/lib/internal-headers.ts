import { headers } from 'next/headers';
import { getServerEnv } from './server-env';

/**
 * Headers for server-to-server API calls (ADR 0020). The internal token lets
 * the API count the call against the visitor's IP instead of the web
 * container's, so all server-rendered pages do not share one rate limit.
 * The visitor IP is the one Caddy put in X-Forwarded-For (it replaces any
 * value the client sent). Server-only.
 */
export async function internalHeaders(withVisitorIp: boolean): Promise<Record<string, string>> {
  const token = getServerEnv().INTERNAL_API_TOKEN;
  if (!token) return {};
  const result: Record<string, string> = { 'x-uzgo-internal-token': token };
  if (withVisitorIp) {
    const visitor = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
    if (visitor) result['x-uzgo-client-ip'] = visitor;
  }
  return result;
}
