import { Controller, Get, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AppException } from '../common/http-exception.filter.js';
import { Public } from '../auth/decorators.js';
import { normalizePhone } from '../auth/phone.js';
import { FakeSmsProvider } from '../sms/fake-sms.provider.js';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider.js';

/**
 * TEST SUPPORT ONLY: lets browser end-to-end tests read the last OTP sent by
 * the in-memory FakeSmsProvider. Answers 404 unless NODE_ENV=test and
 * SMS_PROVIDER=fake (a combination env validation forbids in production).
 */
@ApiExcludeController()
@Public()
@Controller('__test__')
export class TestSupportController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  @Get('last-otp')
  lastOtp(@Query('phone') phone: string | undefined): { code: string } {
    const enabled =
      this.env.NODE_ENV === 'test' &&
      this.env.SMS_PROVIDER === 'fake' &&
      this.sms instanceof FakeSmsProvider;
    const normalized = phone ? normalizePhone(phone) : null;
    const code = enabled && normalized ? this.sms.lastCodeFor(normalized) : undefined;
    if (!code) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    return { code };
  }
}
