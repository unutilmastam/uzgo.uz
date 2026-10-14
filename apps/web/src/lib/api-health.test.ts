import { describe, expect, it } from 'vitest';
import { getApiHealth } from './api-health';

function fakeFetch(responses: Record<string, { status: number; body: unknown }>): typeof fetch {
  return (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    const response = responses[path];
    if (!response) return Promise.reject(new Error(`unexpected ${path}`));
    return Promise.resolve(Response.json(response.body, { status: response.status }));
  };
}

describe('getApiHealth', () => {
  const base = 'http://api.test';

  it('reports ok when live and ready', async () => {
    const health = await getApiHealth(
      base,
      fakeFetch({
        '/api/v1/health/live': { status: 200, body: { status: 'ok' } },
        '/api/v1/health/ready': { status: 200, body: { status: 'ok', checks: { database: 'up' } } },
      }),
    );
    expect(health).toEqual({ state: 'ok' });
  });

  it('reports degraded when the database is down', async () => {
    const health = await getApiHealth(
      base,
      fakeFetch({
        '/api/v1/health/live': { status: 200, body: { status: 'ok' } },
        '/api/v1/health/ready': {
          status: 503,
          body: { status: 'error', checks: { database: 'down' } },
        },
      }),
    );
    expect(health).toEqual({ state: 'degraded', database: 'down' });
  });

  it('reports unreachable on network errors or malformed responses', async () => {
    expect(await getApiHealth(base, () => Promise.reject(new Error('ECONNREFUSED')))).toEqual({
      state: 'unreachable',
    });
    expect(
      await getApiHealth(
        base,
        fakeFetch({ '/api/v1/health/live': { status: 200, body: { hello: 'world' } } }),
      ),
    ).toEqual({ state: 'unreachable' });
  });
});
