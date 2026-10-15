import { Logger } from '@nestjs/common';

/** Outbound Telegram messages behind an adapter (bot token from env). */
export interface TelegramProvider {
  readonly name: string;
  send(chatId: string, text: string): Promise<void>;
}

export const TELEGRAM_PROVIDER = Symbol('TELEGRAM_PROVIDER');

/** Telegram Bot API (`sendMessage`). The token never appears in logs or errors. */
export class BotApiTelegramProvider implements TelegramProvider {
  readonly name = 'bot-api';

  constructor(private readonly token: string) {}

  async send(chatId: string, text: string): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Telegram sendMessage failed with HTTP ${String(res.status)}`);
  }
}

/** DEVELOPMENT: logs instead of sending (no token configured). */
export class DevTelegramProvider implements TelegramProvider {
  readonly name = 'dev';
  private readonly logger = new Logger('DevTelegram');

  send(chatId: string, text: string): Promise<void> {
    this.logger.log({ chatId, length: text.length }, 'Telegram message (not sent: no bot token)');
    return Promise.resolve();
  }
}

/** TESTS: keeps messages in memory. */
export class FakeTelegramProvider implements TelegramProvider {
  readonly name = 'fake';
  readonly sent: { chatId: string; text: string }[] = [];
  failNext = 0;

  send(chatId: string, text: string): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('simulated outage'));
    }
    this.sent.push({ chatId, text });
    return Promise.resolve();
  }
}
