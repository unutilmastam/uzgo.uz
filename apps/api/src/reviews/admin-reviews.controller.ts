import {
  Body,
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
import { type AdminReview, adminReviewQuerySchema, hideReviewSchema } from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { metaOf, type Names, PAGE_SIZE } from '../admin/meta.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { maskPhone } from '../common/mask.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsService, toReview } from './reviews.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Review moderation: staff hide abusive or fake reviews (with a note) or publish them again. */
@ApiTags('admin')
@Controller('admin/reviews')
@Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminReviewQuerySchema))
    query: z.output<typeof adminReviewQuerySchema>,
  ): Promise<{ items: AdminReview[]; page: number; pageSize: number; total: number }> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.maxRating ? { rating: { lte: query.maxRating } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          rating: true,
          text: true,
          status: true,
          moderationNote: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: { phone: true, profile: { select: { firstName: true, lastName: true } } },
          },
          product: { select: { id: true, slug: true, title: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        ...toReview(row),
        status: row.status,
        moderationNote: row.moderationNote,
        product: { ...row.product, title: row.product.title as Names },
        authorPhone: maskPhone(row.user.phone),
      })),
      page: query.page,
      pageSize: PAGE_SIZE,
      total,
    };
  }

  @Post(':id/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  async hide(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(hideReviewSchema)) body: z.output<typeof hideReviewSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.reviews.moderate(id, 'HIDDEN', body.note, auth.user.id, metaOf(req));
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  async publish(
    @Param('id', uuid) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.reviews.moderate(id, 'PUBLISHED', null, auth.user.id, metaOf(req));
  }
}
