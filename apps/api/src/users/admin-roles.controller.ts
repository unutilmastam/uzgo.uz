import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { grantRoleSchema } from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { clientIp } from '../common/http.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentAuth, Roles } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PRIVILEGED: Role[] = [Role.ADMIN, Role.SUPER_ADMIN];

/** Role management. Every change is audited; only SUPER_ADMIN manages admins. */
@ApiTags('admin')
@Controller('admin/users/:userId/roles')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminRolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private check(auth: AuthContext, userId: string, role: Role): void {
    if (auth.user.id === userId) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You cannot change your own roles');
    }
    if (PRIVILEGED.includes(role) && !auth.user.roles.includes(Role.SUPER_ADMIN)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only a super admin can do this');
    }
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async grant(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', new ParseUUIDPipe({ version: '7' })) userId: string,
    @Body(new ZodValidationPipe(grantRoleSchema)) body: z.infer<typeof grantRoleSchema>,
    @Req() req: Request,
  ): Promise<void> {
    const role = body.role;
    this.check(auth, userId, role);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
      const existing = await tx.userRole.findUnique({ where: { userId_role: { userId, role } } });
      if (existing) return;
      await tx.userRole.create({ data: { userId, role, grantedById: auth.user.id } });
      await this.audit.record(
        {
          action: 'role.granted',
          entityType: 'User',
          entityId: userId,
          actorId: auth.user.id,
          metadata: { role },
          ip: clientIp(req),
          requestId: typeof req.id === 'string' ? req.id : undefined,
        },
        tx,
      );
    });
  }

  @Delete(':role')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', new ParseUUIDPipe({ version: '7' })) userId: string,
    @Param('role', new ParseEnumPipe(Role)) role: Role,
    @Req() req: Request,
  ): Promise<void> {
    this.check(auth, userId, role);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.userRole.deleteMany({ where: { userId, role } });
      if (deleted.count === 0) return;
      await this.audit.record(
        {
          action: 'role.revoked',
          entityType: 'User',
          entityId: userId,
          actorId: auth.user.id,
          metadata: { role },
          ip: clientIp(req),
          requestId: typeof req.id === 'string' ? req.id : undefined,
        },
        tx,
      );
    });
  }
}
