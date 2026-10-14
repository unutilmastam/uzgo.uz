import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type TotpCode,
  type TotpSetupResponse,
  type TotpStatus,
  totpCodeSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import { clientIp } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { Role } from '../generated/prisma/enums.js';
import type { AuthContext } from './auth.types.js';
import { CurrentAuth, Roles } from './decorators.js';
import { TotpService } from './totp.service.js';

const metaOf = (req: Request) => ({
  ip: clientIp(req),
  requestId: typeof req.id === 'string' ? req.id : undefined,
});

/** Staff second factor (TOTP authenticator app). Customers and sellers do not use it. */
@ApiTags('auth')
@Controller('auth/totp')
@Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
export class TotpController {
  constructor(
    private readonly totp: TotpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('status')
  async status(@CurrentAuth() auth: AuthContext): Promise<TotpStatus> {
    return {
      ...(await this.totp.status(auth.user.id, auth.sessionId)),
      required: this.env.STAFF_TOTP_REQUIRED,
    };
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  setup(@CurrentAuth() auth: AuthContext): Promise<TotpSetupResponse> {
    return this.totp.setup(auth.user.id, auth.user.phone);
  }

  @Post('enable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  enable(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(totpCodeSchema)) body: TotpCode,
    @Req() req: Request,
  ): Promise<void> {
    return this.totp.enable(auth.user.id, auth.sessionId, body.code, metaOf(req));
  }

  @Post('verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verify(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(totpCodeSchema)) body: TotpCode,
    @Req() req: Request,
  ): Promise<void> {
    return this.totp.verify(auth.user.id, auth.sessionId, body.code, metaOf(req));
  }
}
