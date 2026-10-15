import { Module } from '@nestjs/common';
import { AdminReviewsController } from './admin-reviews.controller.js';
import { MyReviewsController, PublicReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  controllers: [PublicReviewsController, MyReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
