/** Outbound SMS behind an adapter (docs/ARCHITECTURE.md). */
export interface SmsProvider {
  /** Human-readable adapter name for logs, e.g. "dev". */
  readonly name: string;
  send(phoneE164: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
