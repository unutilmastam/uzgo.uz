import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type AuditList, auditQuerySchema } from '@uzgo/contracts';
import type { z } from 'zod';
import { RequireStaffTotp, Roles } from '../auth/decorators.js';
import { maskPhone } from '../common/mask.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const LIMIT = 50;

/**
 * Read-only audit log viewer (newest first, cursor pagination). IP hashes are
 * never returned; actor phones are masked. The log itself is append-only.
 */
@ApiTags('admin')
@Controller('admin/audit')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.output<typeof auditQuerySchema>,
  ): Promise<AuditList> {
    const where = {
      // "store." lists every store action; "store.approved" one action.
      ...(query.action
        ? query.action.endsWith('.')
          ? { action: { startsWith: query.action } }
          : { action: query.action }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      // UUIDv7 ids sort by creation time.
      ...(query.before ? { id: { lt: query.before } } : {}),
    } satisfies Prisma.AuditEventWhereInput;
    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { id: 'desc' },
      take: LIMIT + 1,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        requestId: true,
        createdAt: true,
        actor: { select: { id: true, phone: true } },
      },
    });
    const page = rows.slice(0, LIMIT);
    return {
      items: page.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.actor ? { id: row.actor.id, phone: maskPhone(row.actor.phone) } : null,
        metadata: row.metadata,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      })),
      nextBefore: rows.length > LIMIT ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
