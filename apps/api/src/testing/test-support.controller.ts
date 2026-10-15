import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AppException } from '../common/http-exception.filter.js';
import { Public } from '../auth/decorators.js';
import { normalizePhone } from '../auth/phone.js';
import { FakeSmsProvider } from '../sms/fake-sms.provider.js';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
    private readonly prisma: PrismaService,
  ) {}

  private get enabled(): boolean {
    return (
      this.env.NODE_ENV === 'test' &&
      this.env.SMS_PROVIDER === 'fake' &&
      this.sms instanceof FakeSmsProvider
    );
  }

  /** Grants a staff role to an existing account, so e2e tests can reach the admin panel. */
  @Post('grant-role')
  @HttpCode(HttpStatus.NO_CONTENT)
  async grantRole(@Body() body: { phone?: unknown; role?: unknown }): Promise<void> {
    const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : null;
    const role = body.role;
    if (
      !this.enabled ||
      !phone ||
      (role !== 'MODERATOR' && role !== 'ADMIN' && role !== 'SUPER_ADMIN')
    ) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    }
    const user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (!user) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    await this.prisma.userRole.createMany({
      data: [{ userId: user.id, role }],
      skipDuplicates: true,
    });
  }

  @Get('last-otp')
  lastOtp(@Query('phone') phone: string | undefined): { code: string } {
    const enabled = this.enabled;
    const normalized = phone ? normalizePhone(phone) : null;
    const code =
      enabled && normalized && this.sms instanceof FakeSmsProvider
        ? this.sms.lastCodeFor(normalized)
        : undefined;
    if (!code) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    return { code };
  }
}
