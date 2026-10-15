import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { NotificationsService } from './notifications.service.js';

const EVERY_MS = 15_000;

/** Sends the outbox in the background (disabled in tests, which call the service). */
@Injectable()
export class NotificationsJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsJobs.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly notifications: NotificationsService,
    @Inject(ENV) private readonly env: Env,
    private readonly alerts: AlertsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.notifications.dispatchDue();
    } catch (err) {
      this.logger.error({ err }, 'Notification dispatch failed');
      this.alerts.report(
        'job:notifications',
        `Notification dispatch failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
