import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AdminUser, type AdminUserList, adminUserListQuerySchema } from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { TotpService } from '../auth/totp.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { metaOf, PAGE_SIZE } from './meta.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const STAFF: Role[] = [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN];

const userSelect = {
  id: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  profile: { select: { firstName: true, lastName: true } },
  roles: { select: { role: true } },
  staffTotps: { select: { enabledAt: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    phone: row.phone,
    name: [row.profile?.firstName, row.profile?.lastName].filter(Boolean).join(' ') || null,
    status: row.status,
    roles: row.roles.map((r) => r.role),
    totpEnabled: row.staffTotps.some((t) => t.enabledAt !== null),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * User search and account safety actions. Blocking signs the user out
 * everywhere. Staff accounts can only be blocked by a super admin.
 */
@ApiTags('admin')
@Controller('admin/users')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly totp: TotpService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminUserListQuerySchema))
    query: z.output<typeof adminUserListQuerySchema>,
  ): Promise<AdminUserList> {
    const where = {
      deletedAt: null,
      ...(query.phone ? { phone: { contains: query.phone.replace(/^\+/, '') } } : {}),
      ...(query.role ? { roles: { some: { role: query.role } } } : {}),
    } satisfies Prisma.UserWhereInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: userSelect,
      }),
    ]);
    return { items: rows.map(toAdminUser), total, page: query.page, pageSize: PAGE_SIZE };
  }

  @Get(':id')
  async get(@Param('id', uuid) id: string): Promise<{ user: AdminUser }> {
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    if (!row) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
    return { user: toAdminUser(row) };
  }

  private async target(auth: AuthContext, id: string): Promise<UserRow> {
    if (auth.user.id === id) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You cannot do this to yourself');
    }
    const row = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });
    if (!row) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
    const isStaff = row.roles.some((r) => STAFF.includes(r.role));
    if (isStaff && !auth.user.roles.includes(Role.SUPER_ADMIN)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only a super admin can do this');
    }
    return row;
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  async block(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() req: Request,
  ): Promise<{ user: AdminUser }> {
    await this.target(auth, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'BLOCKED' } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'user.blocked',
          entityType: 'User',
          entityId: id,
          actorId: auth.user.id,
          ...metaOf(req),
        },
        tx,
      );
    });
    return this.get(id);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  async unblock(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() req: Request,
  ): Promise<{ user: AdminUser }> {
    await this.target(auth, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'ACTIVE' } });
      await this.audit.record(
        {
          action: 'user.unblocked',
          entityType: 'User',
          entityId: id,
          actorId: auth.user.id,
          ...metaOf(req),
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Lost authenticator: remove the factor so the person can enrol again. Super admin only. */
  @Post(':id/totp-reset')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  async resetTotp(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Req() req: Request,
  ): Promise<{ user: AdminUser }> {
    await this.target(auth, id);
    await this.totp.reset(id, auth.user.id, metaOf(req));
    return this.get(id);
  }
}
