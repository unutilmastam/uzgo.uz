import { describe, expect, it } from 'vitest';
import { EskizSmsProvider } from './eskiz-sms.provider.js';

const config = {
  email: 'ops@example.uz',
  password: 'secret-password',
  from: '4546',
  baseUrl: 'https://eskiz.test/api',
};

function fakeFetch(sendStatuses: number[]) {
  const calls: { url: string; auth: string | null; body: FormData }[] = [];
  let logins = 0;
  const fn = (input: string, init?: RequestInit) => {
    const url = input;
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get('authorization'), body: init?.body as FormData });
    if (url.endsWith('/auth/login')) {
      logins += 1;
      return Promise.resolve(Response.json({ data: { token: `tok-${String(logins)}` } }));
    }
    const status = sendStatuses.shift() ?? 200;
    return Promise.resolve(new Response('{}', { status }));
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

describe('EskizSmsProvider', () => {
  it('logs in once, reuses the token and strips the plus sign', async () => {
    const { fn, calls } = fakeFetch([200, 200]);
    const sms = new EskizSmsProvider(config, fn);
    await sms.send('+998901234567', 'Kod: 123456');
    await sms.send('+998901234568', 'Kod: 654321');
    expect(calls.map((c) => c.url.replace(config.baseUrl, ''))).toEqual([
      '/auth/login',
      '/message/sms/send',
      '/message/sms/send',
    ]);
    expect(calls[1]?.auth).toBe('Bearer tok-1');
    expect(calls[1]?.body.get('mobile_phone')).toBe('998901234567');
    expect(calls[1]?.body.get('from')).toBe('4546');
  });

  it('re-logs in once on 401 and fails without leaking secrets', async () => {
    const { fn, calls } = fakeFetch([401, 200]);
    const sms = new EskizSmsProvider(config, fn);
    await sms.send('+998901234567', 'x');
    expect(calls.filter((c) => c.url.endsWith('/auth/login'))).toHaveLength(2);
    expect(calls.at(-1)?.auth).toBe('Bearer tok-2');

    const failing = new EskizSmsProvider(config, fakeFetch([500]).fn);
    const error = await failing.send('+998901234567', 'x').then(
      () => new Error('expected failure'),
      (e: unknown) => e as Error,
    );
    expect(error.message).toBe('Eskiz send failed with HTTP 500');
    expect(error.message).not.toContain('secret-password');
  });
});
