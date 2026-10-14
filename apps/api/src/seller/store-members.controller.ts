import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AddStoreMember, type StoreMember, addStoreMemberSchema } from '@uzgo/contracts';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { normalizePhone } from '../auth/phone.js';
import { clientIp } from '../common/http.js';
import { AppException } from '../common/http-exception.filter.js';
import { maskPhone } from '../common/mask.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role, StoreRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoreAccessService } from './store-access.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const MAX_MEMBERS = 20;

/** Store team management. Only the owner adds or removes staff. */
@ApiTags('seller')
@Controller('seller/stores/:storeId/members')
export class StoreMembersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: StoreAccessService,
  ) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
  ): Promise<{ items: StoreMember[] }> {
    await this.access.require(auth.user.id, storeId, { owner: true });
    const rows = await this.prisma.storeMember.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            phone: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return {
      items: rows.map((row) => ({
        userId: row.user.id,
        phone: row.user.phone,
        name:
          [row.user.profile?.firstName, row.user.profile?.lastName].filter(Boolean).join(' ') ||
          null,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Adds an existing UZGO account as staff (the person signs in once with OTP first). */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async add(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Body(new ZodValidationPipe(addStoreMemberSchema)) body: AddStoreMember,
    @Req() req: Request,
  ): Promise<void> {
    await this.access.require(auth.user.id, storeId, { owner: true, write: true });
    const phone = normalizePhone(body.phone);
    if (!phone)
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Invalid phone number');
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { phone, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!user) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'USER_NOT_FOUND',
          'No account with this phone. Ask the person to sign in to UZGO once',
        );
      }
      const existing = await tx.storeMember.findUnique({
        where: { storeId_userId: { storeId, userId: user.id } },
      });
      if (existing)
        throw new AppException(HttpStatus.CONFLICT, 'ALREADY_MEMBER', 'Already in the team');
      if ((await tx.storeMember.count({ where: { storeId } })) >= MAX_MEMBERS) {
        throw new AppException(HttpStatus.CONFLICT, 'TEAM_LIMIT', 'Team limit reached');
      }
      await tx.storeMember.create({ data: { storeId, userId: user.id, role: StoreRole.STAFF } });
      await tx.userRole.createMany({
        data: [{ userId: user.id, role: Role.SELLER_STAFF, grantedById: auth.user.id }],
        skipDuplicates: true,
      });
      await this.audit.record(
        {
          action: 'store.member_added',
          entityType: 'Store',
          entityId: storeId,
          actorId: auth.user.id,
          metadata: { userId: user.id, phone: maskPhone(phone) },
          ip: clientIp(req),
          requestId: typeof req.id === 'string' ? req.id : undefined,
        },
        tx,
      );
    });
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('userId', uuid) userId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.access.require(auth.user.id, storeId, { owner: true });
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.storeMember.findUnique({
        where: { storeId_userId: { storeId, userId } },
        select: { role: true },
      });
      if (!member) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not in the team');
      if (member.role === StoreRole.OWNER) {
        throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'The owner cannot be removed');
      }
      await tx.storeMember.delete({ where: { storeId_userId: { storeId, userId } } });
      // Drop the global staff role when the person is no longer staff anywhere.
      if ((await tx.storeMember.count({ where: { userId, role: StoreRole.STAFF } })) === 0) {
        await tx.userRole.deleteMany({ where: { userId, role: Role.SELLER_STAFF } });
      }
      await this.audit.record(
        {
          action: 'store.member_removed',
          entityType: 'Store',
          entityId: storeId,
          actorId: auth.user.id,
          metadata: { userId },
          ip: clientIp(req),
          requestId: typeof req.id === 'string' ? req.id : undefined,
        },
        tx,
      );
    });
  }
}
