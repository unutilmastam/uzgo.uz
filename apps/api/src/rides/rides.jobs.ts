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
import { RidesService } from './rides.service.js';

const EVERY_MS = 60_000;

/** Closes rides nobody accepted in time (NO_DRIVER). Off in tests. */
@Injectable()
export class RidesJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RidesJobs.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly rides: RidesService,
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
      const expired = await this.rides.expireSearches();
      if (expired > 0) this.logger.log({ expired }, 'Rides without a driver closed');
    } catch (err) {
      this.logger.error({ err }, 'Ride housekeeping failed');
      this.alerts.report(
        'job:rides',
        `Ride housekeeping failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
