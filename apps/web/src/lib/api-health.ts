import { healthLiveSchema, healthReadySchema } from '@uzgo/contracts';

export type ApiHealth =
  { state: 'ok' } | { state: 'degraded'; database: 'down' } | { state: 'unreachable' };

const TIMEOUT_MS = 3000;

/**
 * Asks the API for its health. Responses are validated with the shared
 * contracts, so a malformed answer counts as unreachable.
 */
export async function getApiHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiHealth> {
  try {
    const live = await fetchImpl(`${baseUrl}/api/v1/health/live`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!live.ok || !healthLiveSchema.safeParse(await live.json()).success) {
      return { state: 'unreachable' };
    }

    const ready = await fetchImpl(`${baseUrl}/api/v1/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const parsed = healthReadySchema.safeParse(await ready.json());
    if (!parsed.success) return { state: 'unreachable' };
    return parsed.data.checks.database === 'up'
      ? { state: 'ok' }
      : { state: 'degraded', database: 'down' };
  } catch {
    return { state: 'unreachable' };
  }
}
