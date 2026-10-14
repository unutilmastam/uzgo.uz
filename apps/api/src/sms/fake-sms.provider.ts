import type { SmsProvider } from './sms.provider.js';

export type SentSms = { phone: string; text: string; at: Date };

/** TESTS ONLY. Keeps messages in memory so tests can read the code. */
export class FakeSmsProvider implements SmsProvider {
  readonly name = 'fake';
  readonly sent: SentSms[] = [];

  constructor(nodeEnv: string | undefined = process.env.NODE_ENV) {
    if (nodeEnv !== 'test') {
      throw new Error('FakeSmsProvider can only be used when NODE_ENV=test');
    }
  }

  send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text, at: new Date() });
    if (this.sent.length > 1000) this.sent.shift();
    return Promise.resolve();
  }

  lastCodeFor(phone: string): string | undefined {
    const message = this.sent.findLast((sms) => sms.phone === phone);
    return /\b(\d{6})\b/.exec(message?.text ?? '')?.[1];
  }
}
