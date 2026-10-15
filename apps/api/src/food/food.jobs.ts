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
import { FoodOrdersService } from './food-orders.service.js';

const EVERY_MS = 60_000;

/** Cancels food orders restaurants did not accept in time. Off in tests. */
@Injectable()
export class FoodJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FoodJobs.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly food: FoodOrdersService,
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
      const cancelled = await this.food.cancelUnaccepted();
      if (cancelled > 0) this.logger.log({ cancelled }, 'Cancelled unaccepted food orders');
    } catch (err) {
      this.logger.error({ err }, 'Food housekeeping failed');
      this.alerts.report(
        'job:food',
        `Food housekeeping failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
