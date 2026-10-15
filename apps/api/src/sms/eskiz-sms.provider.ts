import type { SmsProvider } from './sms.provider.js';

type FetchFn = typeof fetch;

export type EskizConfig = {
  email: string;
  password: string;
  from: string;
  baseUrl: string;
};

/**
 * Eskiz.uz SMS gateway (https://notify.eskiz.uz).
 *
 * Flow: POST /auth/login (email, password) returns a JWT (~30 days), then
 * POST /message/sms/send with a Bearer token. On 401 the token is refreshed
 * once by logging in again. Eskiz moderates message texts: every template
 * (OTP, order notices) must be approved in the Eskiz cabinet before launch.
 * Credentials and the token never appear in logs or error messages.
 * VERIFY against the official Eskiz API docs before go-live (ADR 0020).
 */
export class EskizSmsProvider implements SmsProvider {
  readonly name = 'eskiz';
  private token: string | null = null;

  constructor(
    private readonly config: EskizConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async send(phoneE164: string, text: string): Promise<void> {
    let res = await this.post(phoneE164, text, await this.getToken());
    if (res.status === 401) {
      this.token = null;
      res = await this.post(phoneE164, text, await this.getToken());
    }
    if (!res.ok) throw new Error(`Eskiz send failed with HTTP ${String(res.status)}`);
  }

  private post(phoneE164: string, text: string, token: string): Promise<Response> {
    const body = new FormData();
    body.set('mobile_phone', phoneE164.replace(/^\+/, ''));
    body.set('message', text);
    body.set('from', this.config.from);
    return this.fetchFn(`${this.config.baseUrl}/message/sms/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const body = new FormData();
    body.set('email', this.config.email);
    body.set('password', this.config.password);
    const res = await this.fetchFn(`${this.config.baseUrl}/auth/login`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Eskiz login failed with HTTP ${String(res.status)}`);
    const json = (await res.json()) as { data?: { token?: unknown } };
    const token = json.data?.token;
    if (typeof token !== 'string' || !token) throw new Error('Eskiz login returned no token');
    this.token = token;
    return token;
  }
}
