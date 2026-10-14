import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { OtpRequestResponse } from '@uzgo/contracts';
import { PinoLogger } from 'nestjs-pino';
import { AuditService } from '../audit/audit.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { hmac, randomNumericCode, safeEqualHex } from '../common/crypto.js';
import { AppException } from '../common/http-exception.filter.js';
import { maskPhone } from '../common/mask.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider.js';
import { normalizePhone } from './phone.js';
import { SessionService } from './session.service.js';

/** OTP policy (docs/SECURITY.md). */
export const OTP_POLICY = {
  ttlSeconds: 180,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  perPhonePerHour: 5,
  perPhonePerDay: 10,
} as const;

const SMS_TEXT = {
  uz: (code: string) => `UZGO tasdiqlash kodi: ${code}. Uni hech kimga bermang.`,
  ru: (code: string) => `Код подтверждения UZGO: ${code}. Никому не сообщайте его.`,
} as const;

type RequestMeta = { ip: string; userAgent?: string | undefined; requestId?: string | undefined };

function invalidCode(): AppException {
  // One generic error for wrong, expired, used or locked codes.
  return new AppException(HttpStatus.BAD_REQUEST, 'INVALID_CODE', 'The code is invalid or expired');
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    this.logger.setContext(OtpService.name);
  }

  private codeHash(phone: string, code: string): string {
    return hmac(this.env.AUTH_SECRET, `otp:${phone}:${code}`);
  }

  private ipHash(ip: string): string {
    return hmac(this.env.AUTH_SECRET, `ip:${ip}`);
  }

  async request(
    phoneInput: string,
    locale: 'uz' | 'ru',
    meta: RequestMeta,
  ): Promise<OtpRequestResponse> {
    const phone = normalizePhone(phoneInput);
    if (!phone) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Invalid phone number');
    }
    const ipHash = this.ipHash(meta.ip);
    const code = randomNumericCode();

    // Serialise requests per phone so concurrent calls cannot bypass the limits.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`otp:${phone}`}, 0))`;
      const now = Date.now();
      const latest = await tx.otpCode.findFirst({
        where: { phone },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (latest) {
        const waitMs = latest.createdAt.getTime() + OTP_POLICY.resendCooldownSeconds * 1000 - now;
        if (waitMs > 0) {
          throw new AppException(
            HttpStatus.TOO_MANY_REQUESTS,
            'OTP_RESEND_TOO_SOON',
            'Please wait before requesting a new code',
            { retryAfterSeconds: Math.ceil(waitMs / 1000) },
          );
        }
      }
      const [perHour, perDay, perIp] = await Promise.all([
        tx.otpCode.count({ where: { phone, createdAt: { gt: new Date(now - 3_600_000) } } }),
        tx.otpCode.count({ where: { phone, createdAt: { gt: new Date(now - 86_400_000) } } }),
        tx.otpCode.count({ where: { ipHash, createdAt: { gt: new Date(now - 3_600_000) } } }),
      ]);
      if (
        perHour >= OTP_POLICY.perPhonePerHour ||
        perDay >= OTP_POLICY.perPhonePerDay ||
        perIp >= this.env.OTP_IP_HOURLY_LIMIT
      ) {
        this.logger.warn({ phone: maskPhone(phone) }, 'OTP limit reached');
        throw new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          'OTP_LIMIT_REACHED',
          'Too many codes requested. Try again later',
        );
      }
      await tx.otpCode.create({
        data: {
          phone,
          codeHash: this.codeHash(phone, code),
          expiresAt: new Date(now + OTP_POLICY.ttlSeconds * 1000),
          ipHash,
        },
      });
    });

    try {
      await this.sms.send(phone, SMS_TEXT[locale](code));
    } catch (error) {
      this.logger.error(
        { err: error, phone: maskPhone(phone), provider: this.sms.name },
        'SMS failed',
      );
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SMS_UNAVAILABLE',
        'Could not send SMS',
      );
    }

    return {
      expiresInSeconds: OTP_POLICY.ttlSeconds,
      resendInSeconds: OTP_POLICY.resendCooldownSeconds,
    };
  }

  /** Verifies the latest code for the phone; on success creates the user (if new) and a session. */
  async verify(
    phoneInput: string,
    code: string,
    locale: 'uz' | 'ru',
    meta: RequestMeta,
  ): Promise<{ token: string; userId: string }> {
    const phone = normalizePhone(phoneInput);
    if (!phone) throw invalidCode();

    const now = new Date();
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt <= now || otp.attempts >= OTP_POLICY.maxAttempts) {
      throw invalidCode();
    }

    if (!safeEqualHex(this.codeHash(phone, code), otp.codeHash)) {
      const updated = await this.prisma.otpCode.updateMany({
        where: { id: otp.id, attempts: { lt: OTP_POLICY.maxAttempts } },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count > 0 && otp.attempts + 1 >= OTP_POLICY.maxAttempts) {
        await this.audit.record({
          action: 'auth.otp_locked',
          entityType: 'OtpCode',
          entityId: otp.id,
          metadata: { phone: maskPhone(phone) },
          ip: meta.ip,
          requestId: meta.requestId,
        });
      }
      throw invalidCode();
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic single use: only one concurrent request can consume the code.
      const consumed = await tx.otpCode.updateMany({
        where: {
          id: otp.id,
          consumedAt: null,
          attempts: { lt: OTP_POLICY.maxAttempts },
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count === 0) throw invalidCode();

      let user = await tx.user.findUnique({
        where: { phone },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!user) {
        user = await tx.user.create({
          data: { phone, locale, profile: { create: {} }, roles: { create: { role: 'CUSTOMER' } } },
          select: { id: true, status: true, deletedAt: true },
        });
        await this.audit.record(
          {
            action: 'user.created',
            entityType: 'User',
            entityId: user.id,
            actorId: user.id,
            metadata: { via: 'otp' },
            ip: meta.ip,
            requestId: meta.requestId,
          },
          tx,
        );
      }
      if (user.status !== 'ACTIVE' || user.deletedAt !== null) {
        throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_BLOCKED', 'This account is blocked');
      }

      const { token, sessionId } = await this.sessions.create(user.id, meta, tx);
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      await this.audit.record(
        {
          action: 'auth.login',
          entityType: 'Session',
          entityId: sessionId,
          actorId: user.id,
          ip: meta.ip,
          requestId: meta.requestId,
        },
        tx,
      );
      return { token, userId: user.id };
    });
  }
}
