import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PaymentsService } from './payments.service.js';

const EVERY_MS = 60_000;

/**
 * In-process scheduler for payment housekeeping (expire unpaid orders).
 * Safe with several API instances: each run is a set of conditional updates.
 * Disabled in tests, which call the service directly.
 */
@Injectable()
export class PaymentsJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsJobs.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly payments: PaymentsService,
    @Inject(ENV) private readonly env: Env,
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
      const expired = await this.payments.expireOverdue();
      if (expired > 0) this.logger.log({ expired }, 'Expired unpaid online orders');
    } catch (err) {
      this.logger.error({ err }, 'Payment housekeeping failed');
    } finally {
      this.running = false;
    }
  }
}
