import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AppException } from '../common/http-exception.filter.js';
import { maskPhone } from '../common/mask.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from './totp.js';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
/** A verified second factor is valid for this long per session. */
export const TOTP_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type Meta = { ip: string; requestId?: string | undefined };

const invalid = () =>
  new AppException(HttpStatus.BAD_REQUEST, 'INVALID_CODE', 'The code is invalid');

/** Staff second factor: setup, enable, verify per session, reset. */
@Injectable()
export class TotpService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) env: Env,
  ) {
    this.key = Buffer.from(env.TOTP_ENCRYPTION_KEY, 'base64');
  }

  async status(userId: string, sessionId: string) {
    const [totp, session] = await Promise.all([
      this.prisma.staffTotp.findUnique({ where: { userId }, select: { enabledAt: true } }),
      this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { totpVerifiedAt: true },
      }),
    ]);
    const verifiedAt = session?.totpVerifiedAt;
    return {
      enabled: Boolean(totp?.enabledAt),
      sessionVerified: Boolean(
        verifiedAt && Date.now() - verifiedAt.getTime() < TOTP_SESSION_TTL_MS,
      ),
    };
  }

  /** Starts (or restarts) enrolment. Returns the secret once; it is stored encrypted. */
  async setup(userId: string, phone: string): Promise<{ secret: string; otpauthUri: string }> {
    const existing = await this.prisma.staffTotp.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    if (existing?.enabledAt) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TOTP_ALREADY_ENABLED',
        'Two-factor authentication is already enabled',
      );
    }
    const secret = generateTotpSecret();
    const secretEncrypted = encryptSecret(secret, this.key);
    await this.prisma.staffTotp.upsert({
      where: { userId },
      create: { userId, secretEncrypted },
      update: { secretEncrypted, lastUsedStep: null, failedAttempts: 0, lockedUntil: null },
    });
    return { secret, otpauthUri: otpauthUri(secret, maskPhone(phone)) };
  }

  /** Confirms enrolment with a first code; also verifies the current session. */
  async enable(userId: string, sessionId: string, code: string, meta: Meta): Promise<void> {
    const totp = await this.prisma.staffTotp.findUnique({ where: { userId } });
    if (!totp)
      throw new AppException(HttpStatus.CONFLICT, 'TOTP_NOT_SET_UP', 'Start the setup first');
    if (totp.enabledAt) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'TOTP_ALREADY_ENABLED',
        'Two-factor authentication is already enabled',
      );
    }
    const step = verifyTotp(decryptSecret(totp.secretEncrypted, this.key), code);
    if (step === null) throw invalid();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.staffTotp.update({
        where: { userId },
        data: { enabledAt: now, lastUsedStep: BigInt(step) },
      });
      await tx.session.update({ where: { id: sessionId }, data: { totpVerifiedAt: now } });
      await this.audit.record(
        {
          action: 'auth.totp_enabled',
          entityType: 'User',
          entityId: userId,
          actorId: userId,
          ...meta,
        },
        tx,
      );
    });
  }

  /** Verifies a code for this session (replays refused; 5 failures lock for 15 min). */
  async verify(userId: string, sessionId: string, code: string, meta: Meta): Promise<void> {
    const totp = await this.prisma.staffTotp.findUnique({ where: { userId } });
    if (!totp?.enabledAt)
      throw new AppException(
        HttpStatus.CONFLICT,
        'TOTP_NOT_ENABLED',
        'Set up two-factor authentication first',
      );
    if (totp.lockedUntil && totp.lockedUntil > new Date()) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOTP_LOCKED',
        'Too many wrong codes. Try again later',
      );
    }
    const step = verifyTotp(decryptSecret(totp.secretEncrypted, this.key), code, {
      lastUsedStep: totp.lastUsedStep === null ? null : Number(totp.lastUsedStep),
    });
    if (step === null) {
      const failures = totp.failedAttempts + 1;
      const locked = failures >= MAX_FAILURES;
      await this.prisma.staffTotp.update({
        where: { userId },
        data: {
          failedAttempts: locked ? 0 : failures,
          lockedUntil: locked ? new Date(Date.now() + LOCK_MS) : null,
        },
      });
      if (locked) {
        await this.audit.record({
          action: 'auth.totp_locked',
          entityType: 'User',
          entityId: userId,
          actorId: userId,
          ...meta,
        });
      }
      throw invalid();
    }
    await this.prisma.$transaction(async (tx) => {
      // Conditional update: a concurrent request with the same code cannot also succeed.
      const updated = await tx.staffTotp.updateMany({
        where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }] },
        data: { lastUsedStep: BigInt(step), failedAttempts: 0, lockedUntil: null },
      });
      if (updated.count === 0) throw invalid();
      await tx.session.update({ where: { id: sessionId }, data: { totpVerifiedAt: new Date() } });
    });
  }

  /** SUPER_ADMIN recovery: removes the factor and signs the user out everywhere. */
  async reset(targetUserId: string, actorId: string, meta: Meta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.staffTotp.deleteMany({ where: { userId: targetUserId } });
      await tx.session.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        { action: 'auth.totp_reset', entityType: 'User', entityId: targetUserId, actorId, ...meta },
        tx,
      );
    });
  }
}
