import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { hmac, randomToken, sha256 } from '../common/crypto.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthContext } from './auth.types.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Opaque, revocable sessions (docs/decisions/0004-otp-and-db-sessions.md). */
@Injectable()
export class SessionService {
  /** __Host- prefix: Secure, Path=/, no Domain — cannot be set by sub-domains. */
  readonly cookieName: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.cookieName = env.NODE_ENV === 'production' ? '__Host-uzgo_session' : 'uzgo_session';
  }

  cookieOptions(maxAgeMs = SESSION_TTL_MS): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  /** Creates a session and returns the raw token (only ever sent in the cookie). */
  async create(
    userId: string,
    meta: { ip: string; userAgent?: string | undefined },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ token: string; sessionId: string }> {
    const token = randomToken();
    const session = await tx.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ipHash: hmac(this.env.AUTH_SECRET, `ip:${meta.ip}`),
        userAgent: meta.userAgent?.slice(0, 256) ?? null,
      },
      select: { id: true },
    });
    return { token, sessionId: session.id };
  }

  /** Resolves a valid session for an active user, or null. */
  async resolve(token: string): Promise<AuthContext | null> {
    if (token.length < 32 || token.length > 128) return null;
    const now = new Date();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        user: {
          select: {
            id: true,
            phone: true,
            status: true,
            deletedAt: true,
            roles: { select: { role: true } },
          },
        },
      },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE' ||
      session.user.deletedAt !== null
    ) {
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        phone: session.user.phone,
        roles: session.user.roles.map((r) => r.role),
      },
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
