import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { parseCookies } from '../common/http.js';
import { AppException } from '../common/http-exception.filter.js';
import type { Role } from '../generated/prisma/client.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { IS_PUBLIC, REQUIRE_STAFF_TOTP, REQUIRED_ROLES } from './decorators.js';
import './auth.types.js';
import { SessionService } from './session.service.js';

/**
 * Global guard: resolves the session cookie on every request, then enforces
 * authentication (deny by default) and roles. UI hiding is never trusted.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = parseCookies(req.headers.cookie)[this.sessions.cookieName];
    if (token) {
      const auth = await this.sessions.resolve(token);
      if (auth) req.auth = auth;
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    if (!req.auth) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Login required');
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, targets);
    if (required && !required.some((role) => req.auth?.user.roles.includes(role))) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Not allowed');
    }
    if (
      this.env.STAFF_TOTP_REQUIRED &&
      this.reflector.getAllAndOverride<boolean>(REQUIRE_STAFF_TOTP, targets) &&
      !req.auth.totpVerified
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'TOTP_REQUIRED',
        'Two-factor verification required',
      );
    }
    return true;
  }
}
