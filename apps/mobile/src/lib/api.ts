import {
  apiErrorSchema,
  CART_TOKEN_HEADER,
  MOBILE_CLIENT_HEADER,
  MOBILE_CLIENT_VALUE,
} from '@uzgo/contracts';
import type { z } from 'zod';

/** Where the session and guest-cart tokens are kept (the OS keystore in the app). */
export interface TokenStorage {
  get(key: TokenKey): Promise<string | null>;
  set(key: TokenKey, value: string): Promise<void>;
  remove(key: TokenKey): Promise<void>;
}
export type TokenKey = 'session' | 'cart';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Options<S extends z.ZodType> = {
  method?: Method;
  body?: unknown;
  schema?: S;
  idempotencyKey?: string;
  locale?: 'uz' | 'ru';
  /** Skip the HTTP cache (public catalog responses are cacheable for a minute). */
  fresh?: boolean;
};

/**
 * The app's only way to the API (ADR 0022): marks itself as the mobile client,
 * sends the session as a bearer token and the guest cart in a header, never
 * uses cookies, and validates every response with the shared Zod contract.
 */
export function createApiClient(deps: {
  baseUrl: string;
  storage: TokenStorage;
  fetch?: typeof fetch;
  onUnauthorized?: () => void;
}) {
  const doFetch = deps.fetch ?? fetch;

  async function request<S extends z.ZodType = z.ZodUnknown>(
    path: string,
    options: Options<S> = {},
  ): Promise<z.output<S>> {
    const [session, cart] = await Promise.all([
      deps.storage.get('session'),
      deps.storage.get('cart'),
    ]);
    const headers: Record<string, string> = {
      [MOBILE_CLIENT_HEADER]: MOBILE_CLIENT_VALUE,
      accept: 'application/json',
    };
    if (session) headers.authorization = `Bearer ${session}`;
    else if (cart) headers[CART_TOKEN_HEADER] = cart;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
    if (options.locale) headers['accept-language'] = options.locale;

    let res: Response;
    try {
      res = await doFetch(`${deps.baseUrl}/api/v1${path}`, {
        method: options.method ?? 'GET',
        headers,
        credentials: 'omit',
        ...(options.fresh ? { cache: 'no-store' as const } : {}),
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR');
    }

    const newCart = res.headers.get(CART_TOKEN_HEADER);
    if (newCart && !session) await deps.storage.set('cart', newCart);

    if (!res.ok) {
      const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
      const error = parsed.success
        ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.details)
        : new ApiError(res.status, 'HTTP_ERROR');
      if (res.status === 401 && session) {
        await deps.storage.remove('session');
        deps.onUnauthorized?.();
      }
      throw error;
    }
    if (res.status === 204) return undefined as z.output<S>;
    const json: unknown = await res.json();
    return (options.schema ? options.schema.parse(json) : json) as z.output<S>;
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;
