import { HttpStatus, Injectable } from '@nestjs/common';
import type { AdminStore, AdminStoreList, SellerStore, StoreApplication } from '@uzgo/contracts';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { normalizePhone } from '../auth/phone.js';
import { Prisma } from '../generated/prisma/client.js';
import { Role, StoreRole, type StoreStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** One seller can own at most this many stores (applications included). */
export const MAX_STORES_PER_OWNER = 3;
const PAGE_SIZE = 20;

export type Meta = { ip: string; requestId?: string | undefined };

type Name = { uz: string; ru: string };

const conflict = (code: string, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);
const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Store not found');

/** Allowed store status transitions (staff actions). */
export type StoreAction = 'approve' | 'reject' | 'suspend' | 'reactivate';

const TRANSITIONS: Record<StoreAction, StoreStatus[]> = {
  approve: ['PENDING'],
  reject: ['PENDING'],
  suspend: ['ACTIVE'],
  reactivate: ['SUSPENDED'],
};

const next: Record<StoreAction, StoreStatus> = {
  approve: 'ACTIVE',
  reject: 'REJECTED',
  suspend: 'SUSPENDED',
  reactivate: 'ACTIVE',
};
const PAST: Record<StoreAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  reactivate: 'reactivated',
};

const adminSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  isDemo: true,
  legalType: true,
  legalName: true,
  taxId: true,
  contactPhone: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  district: { select: { id: true, name: true } },
  members: {
    where: { role: StoreRole.OWNER },
    select: { user: { select: { id: true, phone: true } } },
  },
} satisfies Prisma.StoreSelect;

type AdminRow = Prisma.StoreGetPayload<{ select: typeof adminSelect }>;

function toAdmin(row: AdminRow): AdminStore {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name as Name,
    status: row.status,
    isDemo: row.isDemo,
    legalType: row.legalType,
    legalName: row.legalName,
    taxId: row.taxId,
    contactPhone: row.contactPhone,
    district: row.district ? { id: row.district.id, name: row.district.name as Name } : null,
    owners: row.members.map((m) => m.user),
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Seller onboarding (apply → staff review) and store status management. */
@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listMine(userId: string): Promise<SellerStore[]> {
    const rows = await this.prisma.storeMember.findMany({
      where: { userId, store: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        store: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            isDemo: true,
            reviewNote: true,
            createdAt: true,
          },
        },
      },
    });
    return rows.map(({ role, store }) => ({
      ...store,
      name: store.name as Name,
      myRole: role,
      createdAt: store.createdAt.toISOString(),
    }));
  }

  async apply(userId: string, input: StoreApplication, meta: Meta): Promise<SellerStore> {
    const contactPhone = normalizePhone(input.contactPhone);
    if (!contactPhone) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Invalid phone number');
    }
    const district = await this.prisma.district.findUnique({
      where: { id: input.districtId },
      select: { id: true },
    });
    if (!district) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown district');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialise applications of one user so the limits below cannot be raced.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`store-apply:${userId}`}))`;
        const owned = await tx.storeMember.findMany({
          where: { userId, role: StoreRole.OWNER, store: { deletedAt: null } },
          select: { store: { select: { status: true } } },
        });
        if (owned.some((m) => m.store.status === 'PENDING')) {
          throw conflict('APPLICATION_PENDING', 'An application is already under review');
        }
        if (owned.length >= MAX_STORES_PER_OWNER) {
          throw conflict('STORE_LIMIT', 'Store limit reached');
        }
        const store = await tx.store.create({
          data: {
            slug: input.slug,
            name: input.name,
            status: 'PENDING',
            districtId: input.districtId,
            legalType: input.legalType,
            legalName: input.legalName,
            taxId: input.taxId,
            contactPhone,
            members: { create: { userId, role: StoreRole.OWNER } },
          },
        });
        await this.audit.record(
          {
            action: 'store.applied',
            entityType: 'Store',
            entityId: store.id,
            actorId: userId,
            ...meta,
          },
          tx,
        );
        return {
          id: store.id,
          slug: store.slug,
          name: store.name as Name,
          status: store.status,
          isDemo: store.isDemo,
          myRole: StoreRole.OWNER,
          reviewNote: store.reviewNote,
          createdAt: store.createdAt.toISOString(),
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('SLUG_TAKEN', 'This address is already taken');
      }
      throw err;
    }
  }

  async adminList(status: StoreStatus | undefined, page: number): Promise<AdminStoreList> {
    // Restaurants are managed on their own admin page (ADR 0024).
    const where = {
      deletedAt: null,
      kind: 'SHOP',
      ...(status ? { status } : {}),
    } satisfies Prisma.StoreWhereInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        // Oldest applications first: a review queue.
        orderBy: [{ createdAt: status === 'PENDING' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: adminSelect,
      }),
    ]);
    return { items: rows.map(toAdmin), total, page, pageSize: PAGE_SIZE };
  }

  async adminGet(id: string): Promise<AdminStore> {
    const row = await this.prisma.store.findFirst({
      where: { id, deletedAt: null, kind: 'SHOP' },
      select: adminSelect,
    });
    if (!row) throw notFound();
    return toAdmin(row);
  }

  /**
   * Applies a staff decision. The status change is conditional on the current
   * status, so two reviewers cannot both act on the same application.
   */
  async transition(
    id: string,
    action: StoreAction,
    actorId: string,
    reason: string | null,
    meta: Meta,
  ): Promise<AdminStore> {
    await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findFirst({
        where: { id, deletedAt: null, kind: 'SHOP' },
        select: { status: true },
      });
      if (!store) throw notFound();
      const updated = await tx.store.updateMany({
        where: { id, status: { in: TRANSITIONS[action] } },
        data: {
          status: next[action],
          reviewedAt: new Date(),
          reviewedById: actorId,
          reviewNote: reason,
        },
      });
      if (updated.count === 0) {
        throw conflict('INVALID_TRANSITION', `Cannot ${action} a store in status ${store.status}`);
      }
      if (action === 'approve') {
        // Owners of an approved store get the seller role (idempotent).
        const owners = await tx.storeMember.findMany({
          where: { storeId: id, role: StoreRole.OWNER },
          select: { userId: true },
        });
        await tx.userRole.createMany({
          data: owners.map((o) => ({
            userId: o.userId,
            role: Role.SELLER_OWNER,
            grantedById: actorId,
          })),
          skipDuplicates: true,
        });
      }
      await this.audit.record(
        {
          action: `store.${PAST[action]}`,
          entityType: 'Store',
          entityId: id,
          actorId,
          metadata: { from: store.status, to: next[action], ...(reason ? { reason } : {}) },
          ...meta,
        },
        tx,
      );
    });
    return this.adminGet(id);
  }
}
