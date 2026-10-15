import { Logger } from '@nestjs/common';

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** Per message: delivered, failed (retry later) or device gone (forget the token). */
export type PushResult = { ok: true } | { ok: false; deviceGone: boolean; error: string };

/** Mobile push behind an adapter (ADR 0022). */
export interface PushProvider {
  readonly name: string;
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const CHUNK = 100;

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

/**
 * Expo Push Service: one API for Apple (APNs) and Google (FCM). The FCM and
 * APNs credentials live in the Expo project (EAS), not on our server. An
 * optional access token (EXPO_ACCESS_TOKEN) makes the push API reject anyone
 * else sending to our app's tokens. Payloads carry no personal data.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';

  constructor(
    private readonly accessToken: string | undefined,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const res = await this.fetchFn(EXPO_SEND_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default', priority: 'high' }))),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Expo push failed with HTTP ${String(res.status)}`);
      const tickets = ((await res.json()) as { data?: ExpoTicket[] }).data ?? [];
      for (const [index] of chunk.entries()) {
        const ticket = tickets[index];
        if (ticket?.status === 'ok') results.push({ ok: true });
        else {
          const code = ticket?.details?.error ?? 'UnknownError';
          results.push({ ok: false, deviceGone: code === 'DeviceNotRegistered', error: code });
        }
      }
    }
    return results;
  }
}

/** DEVELOPMENT without devices: logs instead of sending. */
export class DevPushProvider implements PushProvider {
  readonly name = 'dev';
  private readonly logger = new Logger('DevPush');

  send(messages: PushMessage[]): Promise<PushResult[]> {
    this.logger.log({ count: messages.length }, 'Push messages (not sent in development)');
    return Promise.resolve(messages.map(() => ({ ok: true as const })));
  }
}

/** TESTS: keeps messages in memory; tokens in `gone` answer DeviceNotRegistered. */
export class FakePushProvider implements PushProvider {
  readonly name = 'fake';
  readonly sent: PushMessage[] = [];
  readonly gone = new Set<string>();

  send(messages: PushMessage[]): Promise<PushResult[]> {
    return Promise.resolve(
      messages.map((m) => {
        if (this.gone.has(m.to)) {
          return { ok: false as const, deviceGone: true, error: 'DeviceNotRegistered' };
        }
        this.sent.push(m);
        return { ok: true as const };
      }),
    );
  }
}
