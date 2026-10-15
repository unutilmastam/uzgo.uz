import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type MyReview,
  type ProductReviews,
  productReviewsQuerySchema,
  type UpsertReview,
  upsertReviewSchema,
} from '@uzgo/contracts';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, Public } from '../auth/decorators.js';
import { SlugPipe } from '../common/slug.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReviewsService } from './reviews.service.js';

/** Published reviews of a product (public, cached briefly). */
@ApiTags('reviews')
@Public()
@Controller('catalog/products')
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':slug/reviews')
  @Header('Cache-Control', 'public, max-age=60')
  list(
    @Param('slug', SlugPipe) slug: string,
    @Query(new ZodValidationPipe(productReviewsQuerySchema))
    query: z.output<typeof productReviewsQuerySchema>,
  ): Promise<ProductReviews> {
    return this.reviews.published(slug, query.page);
  }
}

/** The signed-in customer's own review of a product. */
@ApiTags('reviews')
@Controller('products')
export class MyReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':slug/reviews/mine')
  mine(@CurrentAuth() auth: AuthContext, @Param('slug', SlugPipe) slug: string): Promise<MyReview> {
    return this.reviews.mine(auth.user.id, slug);
  }

  @Put(':slug/reviews/mine')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  upsert(
    @CurrentAuth() auth: AuthContext,
    @Param('slug', SlugPipe) slug: string,
    @Body(new ZodValidationPipe(upsertReviewSchema)) body: UpsertReview,
  ): Promise<MyReview> {
    return this.reviews.upsert(auth.user.id, slug, body);
  }

  @Delete(':slug/reviews/mine')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentAuth() auth: AuthContext, @Param('slug', SlugPipe) slug: string): Promise<void> {
    return this.reviews.remove(auth.user.id, slug);
  }
}
