import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { SellerModule } from '../seller/seller.module.js';
import { NotificationsJobs } from './notifications.jobs.js';
import { NotificationsService } from './notifications.service.js';
import { StoreNotificationsController } from './notifications.controller.js';
import {
  BotApiTelegramProvider,
  DevTelegramProvider,
  FakeTelegramProvider,
  TELEGRAM_PROVIDER,
  type TelegramProvider,
} from './telegram.provider.js';

/** Order notifications through SMS and Telegram (outbox + background sender, ADR 0019). */
@Module({
  imports: [SellerModule],
  controllers: [StoreNotificationsController],
  providers: [
    {
      provide: TELEGRAM_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): TelegramProvider => {
        if (env.TELEGRAM_BOT_TOKEN) return new BotApiTelegramProvider(env.TELEGRAM_BOT_TOKEN);
        return env.NODE_ENV === 'test' ? new FakeTelegramProvider() : new DevTelegramProvider();
      },
    },
    NotificationsService,
    NotificationsJobs,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
