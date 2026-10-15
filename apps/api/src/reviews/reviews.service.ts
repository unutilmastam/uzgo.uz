import { HttpStatus, Injectable } from '@nestjs/common';
import type { MyReview, ProductReviews, Review, UpsertReview } from '@uzgo/contracts';
import type { Meta } from '../admin/meta.js';
import { AuditService } from '../audit/audit.service.js';
import { visibleProductWhere } from '../catalog/visibility.js';
import { AppException } from '../common/http-exception.filter.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ReviewStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const REVIEWS_PAGE_SIZE = 10;

/** Shipment statuses that prove the customer received the product. */
export const RECEIVED_STATUSES = [
  'DELIVERED',
  'RETURN_REQUESTED',
  'RETURNED',
  'RETURN_REJECTED',
] as const;

type Tx = Prisma.TransactionClient;
type LockedReview = { id: string; productId: string; rating: number; status: ReviewStatus };

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');

/** "Ali V." — never the full surname or the phone. */
export function authorName(profile: { firstName: string | null; lastName: string | null } | null) {
  const first = profile?.firstName?.trim();
  if (!first) return null;
  const initial = profile?.lastName?.trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

const reviewSelect = {
  id: true,
  rating: true,
  text: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.ProductReviewSelect;

export function toReview(row: Prisma.ProductReviewGetPayload<{ select: typeof reviewSelect }>) {
  return {
    id: row.id,
    rating: row.rating,
    text: row.text,
    authorName: authorName(row.user.profile),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies Review;
}

/**
 * Product reviews (Phase 9a, ADR 0023). Only customers who received the
 * product may review it, once per product. Product.ratingSum/ratingCount
 * count PUBLISHED reviews and change in the same transaction as the review,
 * under a row lock, so they never drift.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async published(slug: string, page: number): Promise<ProductReviews> {
    const product = await this.prisma.product.findFirst({
      where: { slug, ...visibleProductWhere },
      select: { id: true },
    });
    if (!product) throw notFound();
    const where = { productId: product.id, status: 'PUBLISHED' as const };
    const [rows, groups] = await this.prisma.$transaction([
      this.prisma.productReview.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * REVIEWS_PAGE_SIZE,
        take: REVIEWS_PAGE_SIZE,
        select: reviewSelect,
      }),
      this.prisma.productReview.groupBy({
        by: ['rating'],
        where,
        orderBy: { rating: 'asc' },
        _count: { _all: true },
      }),
    ]);
    const distribution = [0, 0, 0, 0, 0];
    for (const g of groups) {
      const count = typeof g._count === 'object' ? g._count._all : 0;
      distribution[g.rating - 1] = count;
    }
    return {
      items: rows.map(toReview),
      page,
      pageSize: REVIEWS_PAGE_SIZE,
      total: distribution.reduce((a, b) => a + b, 0),
      distribution,
    };
  }

  async mine(userId: string, slug: string): Promise<MyReview> {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw notFound();
    const [row, canReview] = await Promise.all([
      this.prisma.productReview.findUnique({
        where: { productId_userId: { productId: product.id, userId } },
        select: reviewSelect,
      }),
      this.received(userId, product.id),
    ]);
    return {
      canReview,
      review: row ? { ...toReview(row), hidden: row.status === 'HIDDEN' } : null,
    };
  }

  async upsert(userId: string, slug: string, input: UpsertReview): Promise<MyReview> {
    const product = await this.prisma.product.findFirst({
      where: { slug, ...visibleProductWhere },
      select: { id: true },
    });
    if (!product) throw notFound();
    if (!(await this.received(userId, product.id))) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'REVIEW_NOT_ALLOWED',
        'Only customers who received this product can review it',
      );
    }
    const text = input.text?.trim() ? input.text.trim() : null;
    const write = () =>
      this.prisma.$transaction(async (tx) => {
        const existing = await this.lockByAuthor(tx, product.id, userId);
        if (!existing) {
          await tx.productReview.create({
            data: { productId: product.id, userId, rating: input.rating, text },
          });
          await this.adjust(tx, product.id, input.rating, 1);
          return;
        }
        await tx.productReview.update({
          where: { id: existing.id },
          data: { rating: input.rating, text },
        });
        // A hidden review stays hidden after an edit; only published ones count.
        if (existing.status === 'PUBLISHED') {
          await this.adjust(tx, product.id, input.rating - existing.rating, 0);
        }
      });
    try {
      await write();
    } catch (err) {
      // Two first submissions raced on the unique key: the second becomes an edit.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        await write();
      } else {
        throw err;
      }
    }
    return this.mine(userId, slug);
  }

  async remove(userId: string, slug: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!product) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.lockByAuthor(tx, product.id, userId);
      if (!existing) return;
      await tx.productReview.delete({ where: { id: existing.id } });
      if (existing.status === 'PUBLISHED') {
        await this.adjust(tx, product.id, -existing.rating, -1);
      }
    });
  }

  /** Staff: hide (note required) or publish again. Idempotent. */
  async moderate(
    id: string,
    to: ReviewStatus,
    note: string | null,
    actorId: string,
    meta: Meta,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedReview[]>`
        SELECT id, "productId", rating, status FROM "ProductReview" WHERE id = ${id}::uuid FOR UPDATE`;
      const review = rows[0];
      if (!review) throw notFound();
      if (review.status === to) return;
      await tx.productReview.update({
        where: { id },
        data: { status: to, moderationNote: to === 'HIDDEN' ? note : null },
      });
      const sign = to === 'PUBLISHED' ? 1 : -1;
      await this.adjust(tx, review.productId, sign * review.rating, sign);
      await this.audit.record(
        {
          action: to === 'HIDDEN' ? 'review.hide' : 'review.publish',
          entityType: 'ProductReview',
          entityId: id,
          actorId,
          metadata: { productId: review.productId, rating: review.rating, note },
          ip: meta.ip,
          ...(meta.requestId ? { requestId: meta.requestId } : {}),
        },
        tx,
      );
    });
  }

  /** True when one of the user's shipments with this product reached the customer. */
  private async received(userId: string, productId: string): Promise<boolean> {
    const item = await this.prisma.orderItem.findFirst({
      where: {
        productId,
        sellerOrder: { status: { in: [...RECEIVED_STATUSES] }, order: { userId } },
      },
      select: { id: true },
    });
    return item !== null;
  }

  private async lockByAuthor(tx: Tx, productId: string, userId: string) {
    const rows = await tx.$queryRaw<LockedReview[]>`
      SELECT id, "productId", rating, status FROM "ProductReview"
      WHERE "productId" = ${productId}::uuid AND "userId" = ${userId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  private async adjust(tx: Tx, productId: string, sum: number, count: number) {
    if (sum === 0 && count === 0) return;
    await tx.product.update({
      where: { id: productId },
      data: { ratingSum: { increment: sum }, ratingCount: { increment: count } },
    });
  }
}
