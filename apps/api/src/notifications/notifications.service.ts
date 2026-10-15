import { Inject, Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../common/mask.js';
import { PrismaService } from '../prisma/prisma.service.js';
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
  ) {}

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
                to: row.channel === 'SMS' ? maskPhone(row.recipient) : 'telegram',
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
