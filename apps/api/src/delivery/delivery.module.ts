import { Module } from '@nestjs/common';
import { PromoModule } from '../promo/promo.module.js';
import {
  AdminDeliveryController,
  DeliveryController,
  SellerTrackingController,
} from './delivery.controller.js';

/** Delivery tariffs, pickup points and shipment tracking (ADR 0019). */
@Module({
  imports: [PromoModule],
  controllers: [DeliveryController, SellerTrackingController, AdminDeliveryController],
})
export class DeliveryModule {}
