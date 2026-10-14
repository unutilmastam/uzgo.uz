import { apiErrorSchema } from '@uzgo/contracts';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

/**
 * Browser → API call on the same site (/api/v1, ADR 0007). The session cookie
 * travels automatically; the browser adds the Origin header for the CSRF check.
 */
export async function apiClient<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR');
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    throw new ApiClientError(
      res.status,
      parsed.success ? parsed.data.error.code : 'UNKNOWN',
      parsed.success ? parsed.data.error.details : undefined,
    );
  }
  return json as T;
}
