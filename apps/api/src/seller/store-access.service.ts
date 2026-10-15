import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/http-exception.filter.js';
import type { StoreKind, StoreRole, StoreStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type StoreAccess = { storeId: string; role: StoreRole; status: StoreStatus };

/**
 * Seller isolation (SPEC §9): every seller request is scoped to a store the
 * user is a member of. Non-members get 404 so store ids cannot be probed.
 */
@Injectable()
export class StoreAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async require(
    userId: string,
    storeId: string,
    options: { owner?: boolean; write?: boolean; kind?: StoreKind } = {},
  ): Promise<StoreAccess> {
    const member = await this.prisma.storeMember.findFirst({
      where: {
        userId,
        storeId,
        // Marketplace routes pass SHOP, food routes RESTAURANT; team and money routes serve both.
        store: { deletedAt: null, ...(options.kind ? { kind: options.kind } : {}) },
      },
      select: { role: true, store: { select: { status: true } } },
    });
    if (!member) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Store not found');
    if (options.owner && member.role !== 'OWNER') {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only the store owner can do this');
    }
    // A suspended or rejected store is read-only for its team.
    if (options.write && !['PENDING', 'ACTIVE'].includes(member.store.status)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'STORE_NOT_ACTIVE', 'The store is not active');
    }
    return { storeId, role: member.role, status: member.store.status };
  }
}
