import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type CurrentUser,
  type OtpRequest,
  type OtpRequestResponse,
  type OtpVerify,
  otpRequestSchema,
  otpVerifySchema,
} from '@uzgo/contracts';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { clientIp } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from '../users/users.service.js';
import type { AuthContext } from './auth.types.js';
import { CurrentAuth, Public } from './decorators.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';

function localeOf(req: Request, explicit?: 'uz' | 'ru'): 'uz' | 'ru' {
  if (explicit) return explicit;
  return /^ru\b/i.test(req.headers['accept-language'] ?? '') ? 'ru' : 'uz';
}

function metaOf(req: Request) {
  return {
    ip: clientIp(req),
    userAgent: req.headers['user-agent'],
    requestId: typeof req.id === 'string' ? req.id : undefined,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /** Sends a one-time code. Same response whether or not the phone has an account. */
  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest,
    @Req() req: Request,
  ): Promise<OtpRequestResponse> {
    return this.otp.request(body.phone, localeOf(req, body.locale), metaOf(req));
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerify,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: CurrentUser }> {
    const { token, userId } = await this.otp.verify(
      body.phone,
      body.code,
      localeOf(req),
      metaOf(req),
    );
    res.cookie(this.sessions.cookieName, token, this.sessions.cookieOptions());
    return { user: await this.users.getCurrent(userId) };
  }

  @Get('me')
  async me(@CurrentAuth() auth: AuthContext): Promise<{ user: CurrentUser }> {
    return { user: await this.users.getCurrent(auth.user.id) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'Session',
      entityId: auth.sessionId,
      actorId: auth.user.id,
      ...metaOf(req),
    });
    res.clearCookie(this.sessions.cookieName, this.sessions.cookieOptions(0));
  }

  /** Revokes every session of the user (all devices). */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const count = await this.sessions.revokeAllForUser(auth.user.id);
    await this.audit.record({
      action: 'auth.logout_all',
      entityType: 'User',
      entityId: auth.user.id,
      actorId: auth.user.id,
      metadata: { sessions: count },
      ...metaOf(req),
    });
    res.clearCookie(this.sessions.cookieName, this.sessions.cookieOptions(0));
  }
}
