import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { hmac } from '../common/crypto.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  /** Must not contain secrets, codes or full phone numbers. */
  metadata?: Prisma.InputJsonValue;
  ip?: string;
  requestId?: string;
};

/** Append-only audit trail for sensitive actions (docs/SECURITY.md). */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async record(input: AuditInput, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditEvent.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        actorId: input.actorId ?? null,
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ipHash: input.ip ? hmac(this.env.AUTH_SECRET, `ip:${input.ip}`) : null,
        requestId: input.requestId ?? null,
      },
    });
  }
}
