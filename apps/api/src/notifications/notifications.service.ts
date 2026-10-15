import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../common/mask.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PUSH_PROVIDER, type PushProvider } from '../push/push.provider.js';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider.js';
import { TELEGRAM_PROVIDER, type TelegramProvider } from './telegram.provider.js';

/** Delay before retry n (after failed attempt n); attempt 5 failing marks the message FAILED. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const BATCH = 20;

/**
 * Sends queued notifications (outbox). Rows are claimed with
 * FOR UPDATE SKIP LOCKED so several API instances never send one twice.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(TELEGRAM_PROVIDER) private readonly telegram: TelegramProvider,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  /**
   * Push to every phone of the user with a live session. Tokens the provider
   * reports as gone are forgotten; the message is retried only if no phone got it.
   */
  private async sendPush(
    tx: Prisma.TransactionClient,
    row: { recipient: string; text: string; data: Prisma.JsonValue },
    now: Date,
  ): Promise<void> {
    const devices = await tx.pushDevice.findMany({
      where: { userId: row.recipient, session: { revokedAt: null, expiresAt: { gt: now } } },
      select: { id: true, token: true },
    });
    if (devices.length === 0) return;
    const data =
      row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : undefined;
    const results = await this.push.send(
      devices.map((d) => ({
        to: d.token,
        title: 'UZGO',
        body: row.text,
        ...(data ? { data } : {}),
      })),
    );
    const gone = devices.filter((_, i) => {
      const r = results[i];
      return r && !r.ok && r.deviceGone;
    });
    if (gone.length > 0) {
      await tx.pushDevice.deleteMany({ where: { id: { in: gone.map((d) => d.id) } } });
    }
    const failures = results.filter((r) => !r.ok && !r.deviceGone);
    if (failures.length > 0 && !results.some((r) => r.ok)) {
      const first = failures[0];
      throw new Error(`Push failed: ${first && !first.ok ? first.error : 'unknown'}`);
    }
  }

  /** `only` narrows the batch to some notifications (used by tests on a shared database). */
  async dispatchDue(
    now = new Date(),
    only: string[] | null = null,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    await this.prisma.$transaction(
      async (tx) => {
        const due = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Notification"
          WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
            AND (${only === null} OR "id" = ANY(${only ?? []}::uuid[]))
          ORDER BY "nextAttemptAt" ASC
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`;
        for (const { id } of due) {
          const row = await tx.notification.findUniqueOrThrow({ where: { id } });
          try {
            if (row.channel === 'SMS') await this.sms.send(row.recipient, row.text);
            else if (row.channel === 'PUSH') await this.sendPush(tx, row, now);
            else await this.telegram.send(row.recipient, row.text);
            await tx.notification.update({
              where: { id },
              data: {
                status: 'SENT',
                sentAt: new Date(),
                attempts: row.attempts + 1,
                lastError: null,
              },
            });
            sent += 1;
          } catch (err) {
            const attempts = row.attempts + 1;
            const delay = BACKOFF_MS[attempts - 1];
            await tx.notification.update({
              where: { id },
              data: {
                attempts,
                status: delay === undefined ? 'FAILED' : 'PENDING',
                nextAttemptAt: new Date(now.getTime() + (delay ?? 0)),
                // Never the recipient or the text: only the error class/message.
                lastError: err instanceof Error ? err.message.slice(0, 200) : 'error',
              },
            });
            failed += 1;
            this.logger.warn(
              {
                id,
                channel: row.channel,
                to: row.channel === 'SMS' ? maskPhone(row.recipient) : row.channel.toLowerCase(),
                attempts,
              },
              'Notification delivery failed',
            );
          }
        }
      },
      { timeout: 60_000 },
    );
    return { sent, failed };
  }
}
