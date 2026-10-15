import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import {
  BotApiTelegramProvider,
  FakeTelegramProvider,
  type TelegramProvider,
} from '../notifications/telegram.provider.js';

/** One alert per fingerprint per window; at most MAX_PER_HOUR alerts in total. */
const WINDOW_MS = 10 * 60_000;
const MAX_PER_HOUR = 20;

/**
 * Operator alerts (ADR 0020): unhandled 5xx errors and failing background jobs
 * are sent to an ops Telegram chat. Messages carry only the route pattern,
 * error class and request id — never request bodies, phones, names or tokens.
 * Without ALERT_TELEGRAM_CHAT_ID (or a bot token) alerts are only logged.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly provider: TelegramProvider | null;
  private readonly lastSent = new Map<string, number>();
  private sentTimes: number[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.NODE_ENV === 'test') this.provider = new FakeTelegramProvider();
    else if (env.TELEGRAM_BOT_TOKEN && env.ALERT_TELEGRAM_CHAT_ID) {
      this.provider = new BotApiTelegramProvider(env.TELEGRAM_BOT_TOKEN);
    } else this.provider = null;
  }

  /** Test hook: the in-memory provider in NODE_ENV=test. */
  get testProvider(): FakeTelegramProvider | null {
    return this.provider instanceof FakeTelegramProvider ? this.provider : null;
  }

  /** Fire-and-forget; never throws into the caller. Returns whether it was sent. */
  report(fingerprint: string, text: string, now = Date.now()): boolean {
    const last = this.lastSent.get(fingerprint);
    if (last !== undefined && now - last < WINDOW_MS) return false;
    this.sentTimes = this.sentTimes.filter((t) => now - t < 3_600_000);
    if (this.sentTimes.length >= MAX_PER_HOUR) return false;
    this.lastSent.set(fingerprint, now);
    this.sentTimes.push(now);
    if (this.lastSent.size > 1000) this.lastSent.clear();
    if (!this.provider) return false;
    const chatId = this.env.ALERT_TELEGRAM_CHAT_ID ?? 'test';
    const message = `[UZGO ${this.env.NODE_ENV}] ${text}`.slice(0, 1000);
    this.provider.send(chatId, message).catch((err: unknown) => {
      this.logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'Alert not sent');
    });
    return true;
  }
}
