import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DevSmsProvider } from './dev-sms.provider.js';
import { FakeSmsProvider } from './fake-sms.provider.js';
import { SMS_PROVIDER, type SmsProvider } from './sms.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): SmsProvider =>
        env.SMS_PROVIDER === 'fake'
          ? new FakeSmsProvider(env.NODE_ENV)
          : new DevSmsProvider(env.NODE_ENV),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
