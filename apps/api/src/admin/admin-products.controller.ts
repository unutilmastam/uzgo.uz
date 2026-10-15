import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AdminProduct,
  type AdminProductList,
  adminProductListQuerySchema,
  moderationReasonSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SellerProductsService } from '../seller/seller-products.service.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { metaOf, type Names, PAGE_SIZE } from './meta.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Product moderation queue. Approval makes a product visible on the storefront. */
@ApiTags('admin')
@Controller('admin/products')
@Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: SellerProductsService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminProductListQuerySchema))
    query: z.output<typeof adminProductListQuerySchema>,
  ): Promise<AdminProductList> {
    const where = { status: query.status, deletedAt: null };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        // Review queue: oldest submission first.
        orderBy: [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          slug: true,
          status: true,
          title: true,
          submittedAt: true,
          store: { select: { id: true, slug: true, name: true, status: true } },
          category: { select: { id: true, name: true } },
          images: { orderBy: { sort: 'asc' }, take: 1, select: { storageKey: true } },
          variants: { where: { active: true }, select: { priceTiyin: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => {
        const min = row.variants.reduce<bigint | null>(
          (acc, v) => (acc === null || v.priceTiyin < acc ? v.priceTiyin : acc),
          null,
        );
        const image = row.images[0];
        return {
          id: row.id,
          slug: row.slug,
          status: row.status,
          title: row.title as Names,
          image: image ? this.storage.publicUrl(image.storageKey) : null,
          minPriceTiyin: min?.toString() ?? null,
          store: { ...row.store, name: row.store.name as Names },
          category: { id: row.category.id, name: row.category.name as Names },
          submittedAt: row.submittedAt?.toISOString() ?? null,
        };
      }),
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
    };
  }

  @Get(':id')
  async get(@Param('id', uuid) id: string): Promise<{ product: AdminProduct }> {
    const { storeId, ...product } = await this.products.getForStaff(id);
    const [store, category] = await Promise.all([
      this.prisma.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { id: true, slug: true, name: true, status: true },
      }),
      this.prisma.category.findUniqueOrThrow({
        where: { id: product.categoryId },
        select: { id: true, name: true },
      }),
    ]);
    return {
      product: {
        ...product,
        store: { ...store, name: store.name as Names },
        category: { id: category.id, name: category.name as Names },
      },
    };
  }

  /** PENDING_REVIEW → APPROVED, only for an active store. */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id', uuid) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ product: AdminProduct }> {
    await this.decide(id, auth.user.id, 'APPROVED', null, metaOf(req));
    return this.get(id);
  }

  /** PENDING_REVIEW → REJECTED, or takes down an APPROVED product. The reason is shown to the seller. */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(moderationReasonSchema))
    body: z.infer<typeof moderationReasonSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ product: AdminProduct }> {
    await this.decide(id, auth.user.id, 'REJECTED', body.reason, metaOf(req));
    return this.get(id);
  }

  private async decide(
    id: string,
    actorId: string,
    to: 'APPROVED' | 'REJECTED',
    reason: string | null,
    meta: ReturnType<typeof metaOf>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, deletedAt: null },
        select: { status: true, store: { select: { status: true } } },
      });
      if (!product) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Product not found');
      if (to === 'APPROVED' && product.store.status !== 'ACTIVE') {
        throw new AppException(HttpStatus.CONFLICT, 'STORE_NOT_ACTIVE', 'The store is not active');
      }
      const from =
        to === 'APPROVED'
          ? ['PENDING_REVIEW' as const]
          : ['PENDING_REVIEW' as const, 'APPROVED' as const];
      // Conditional update: two moderators cannot both decide the same submission.
      const updated = await tx.product.updateMany({
        where: { id, status: { in: from } },
        data: { status: to, reviewedAt: new Date(), moderationNote: reason },
      });
      if (updated.count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'INVALID_TRANSITION',
          `Cannot move a product from ${product.status} to ${to}`,
        );
      }
      await this.audit.record(
        {
          action: to === 'APPROVED' ? 'product.approved' : 'product.rejected',
          entityType: 'Product',
          entityId: id,
          actorId,
          metadata: { from: product.status, to, ...(reason ? { reason } : {}) },
          ...meta,
        },
        tx,
      );
    });
  }
}
