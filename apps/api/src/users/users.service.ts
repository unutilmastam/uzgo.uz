import { HttpStatus, Injectable } from '@nestjs/common';
import type { CurrentUser, UpdateProfile } from '@uzgo/contracts';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        locale: true,
        roles: { select: { role: true }, orderBy: { role: 'asc' } },
        profile: {
          select: {
            firstName: true,
            lastName: true,
            districtId: true,
            district: { select: { regionId: true } },
          },
        },
      },
    });
    return {
      id: user.id,
      phone: user.phone,
      locale: user.locale === 'ru' ? 'ru' : 'uz',
      roles: user.roles.map((r) => r.role),
      profile: {
        firstName: user.profile?.firstName ?? null,
        lastName: user.profile?.lastName ?? null,
        districtId: user.profile?.districtId ?? null,
        regionId: user.profile?.district?.regionId ?? null,
      },
    };
  }

  async updateProfile(
    userId: string,
    input: UpdateProfile,
    meta: { ip: string; requestId?: string | undefined },
  ): Promise<CurrentUser> {
    if (input.districtId) {
      const district = await this.prisma.district.findFirst({
        where: { id: input.districtId, active: true },
        select: { id: true },
      });
      if (!district) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown district', [
          { path: 'districtId', message: 'Unknown district' },
        ]);
      }
    }
    const { locale, ...profile } = input;
    await this.prisma.$transaction(async (tx) => {
      if (locale) await tx.user.update({ where: { id: userId }, data: { locale } });
      if (Object.keys(profile).length > 0) {
        await tx.userProfile.upsert({
          where: { userId },
          create: { userId, ...profile },
          update: profile,
        });
      }
      await this.audit.record(
        {
          action: 'user.profile_updated',
          entityType: 'User',
          entityId: userId,
          actorId: userId,
          // Field names only — never the personal values themselves.
          metadata: { fields: Object.keys(input) },
          ip: meta.ip,
          requestId: meta.requestId,
        },
        tx,
      );
    });
    return this.getCurrent(userId);
  }
}
