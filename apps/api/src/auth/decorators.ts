import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';
import type { AuthContext } from './auth.types.js';

export const IS_PUBLIC = 'auth:isPublic';
export const REQUIRED_ROLES = 'auth:roles';

/** Opt out of authentication. Every other route requires a session (deny by default). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Require at least one of the given roles (checked on the server for every request). */
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);

export const REQUIRE_STAFF_TOTP = 'auth:staffTotp';

/**
 * Staff routes (moderation, administration): the session must have passed the
 * TOTP second factor (unless STAFF_TOTP_REQUIRED=false outside production).
 */
export const RequireStaffTotp = () => SetMetadata(REQUIRE_STAFF_TOTP, true);

/** The authenticated session of the current request. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<Request>().auth;
    if (!auth) throw new Error('CurrentAuth used on a public route');
    return auth;
  },
);
