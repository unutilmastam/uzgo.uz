import { Module } from '@nestjs/common';
import { AdminPromoController } from './admin-promo.controller.js';
import { PromoService } from './promo.service.js';

/** UZGO-funded promo codes (ADR 0023). */
@Module({
  controllers: [AdminPromoController],
  providers: [PromoService],
  exports: [PromoService],
})
export class PromoModule {}
