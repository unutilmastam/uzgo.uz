import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { parseCookies } from '../common/http.js';
import { AppException } from '../common/http-exception.filter.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  return URL.parse(value)?.origin ?? null;
}

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies): state-changing
 * requests must come from an allow-listed origin. Requests with neither
 * Origin nor Referer are allowed only when they carry no cookies at all
 * (non-browser clients cannot ride a user's session).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(@Inject(ENV) env: Env) {
    this.allowed = new Set(env.CORS_ORIGINS);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = originOf(req.headers.origin) ?? originOf(req.headers.referer);
    if (origin !== null) {
      if (this.allowed.has(origin)) return true;
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ORIGIN_NOT_ALLOWED',
        'Request origin is not allowed',
      );
    }
    if (Object.keys(parseCookies(req.headers.cookie)).length === 0) return true;
    throw new AppException(HttpStatus.FORBIDDEN, 'ORIGIN_REQUIRED', 'Request origin is required');
  }
}
