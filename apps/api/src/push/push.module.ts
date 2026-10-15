import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PushDevicesController } from './push-devices.controller.js';
import {
  DevPushProvider,
  ExpoPushProvider,
  FakePushProvider,
  PUSH_PROVIDER,
  type PushProvider,
} from './push.provider.js';

/** Mobile push: device registration + provider (ADR 0022). */
@Global()
@Module({
  controllers: [PushDevicesController],
  providers: [
    {
      provide: PUSH_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): PushProvider => {
        if (env.NODE_ENV === 'test') return new FakePushProvider();
        if (env.NODE_ENV === 'development' && !env.EXPO_PUSH_ENABLED) return new DevPushProvider();
        return new ExpoPushProvider(env.EXPO_ACCESS_TOKEN);
      },
    },
  ],
  exports: [PUSH_PROVIDER],
})
export class PushModule {}
