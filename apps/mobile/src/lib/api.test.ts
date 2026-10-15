import { cartResponseSchema } from '@uzgo/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, type TokenKey, type TokenStorage } from './api';

function memoryStorage(initial: Partial<Record<TokenKey, string>> = {}): TokenStorage & {
  data: Partial<Record<TokenKey, string>>;
} {
  const data = { ...initial };
  return {
    data,
    get: (k) => Promise.resolve(data[k] ?? null),
    set: (k, v) => {
      data[k] = v;
      return Promise.resolve();
    },
    remove: (k) => {
      data[k] = undefined;
      return Promise.resolve();
    },
  };
}

const emptyCart = {
  cart: {
    groups: [],
    itemCount: 0,
    subtotalTiyin: '0',
    deliveryTiyin: '0',
    totalTiyin: '0',
    hasIssues: false,
  },
};

describe('mobile API client', () => {
  it('marks requests as mobile, sends the bearer token and never cookies', async () => {
    const fetchMock = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(Response.json(emptyCart)),
    );
    const api = createApiClient({
      baseUrl: 'https://api.test',
      storage: memoryStorage({ session: 's'.repeat(43), cart: 'c'.repeat(43) }),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await api.request('/cart');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test/api/v1/cart');
    expect(init?.credentials).toBe('omit');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-uzgo-client']).toBe('mobile');
    expect(headers.authorization).toBe(`Bearer ${'s'.repeat(43)}`);
    // A logged-in user's cart is the account cart: no guest token is sent.
    expect(headers['x-cart-token']).toBeUndefined();
  });

  it('keeps the guest cart token the API issues', async () => {
    const storage = memoryStorage();
    const api = createApiClient({
      baseUrl: 'https://api.test',
      storage,
      fetch: () =>
        Promise.resolve(Response.json(emptyCart, { headers: { 'x-cart-token': 'g'.repeat(43) } })),
    });
    const result = await api.request('/cart', { schema: cartResponseSchema });
    expect(result.cart.itemCount).toBe(0);
    expect(storage.data.cart).toBe('g'.repeat(43));
  });

  it('turns API errors into ApiError and forgets a rejected session', async () => {
    const storage = memoryStorage({ session: 's'.repeat(43) });
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: 'https://api.test',
      storage,
      onUnauthorized,
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'UNAUTHENTICATED', message: 'Login required', requestId: 'r' } },
            { status: 401 },
          ),
        ),
    });
    const error = await api.request('/auth/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNAUTHENTICATED');
    expect(storage.data.session).toBeUndefined();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('reports network failures with a stable code', async () => {
    const api = createApiClient({
      baseUrl: 'https://api.test',
      storage: memoryStorage(),
      fetch: () => Promise.reject(new TypeError('Network request failed')),
    });
    await expect(api.request('/cart')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
