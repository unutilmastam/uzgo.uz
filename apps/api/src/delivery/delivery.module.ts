import { Module } from '@nestjs/common';
import {
  AdminDeliveryController,
  DeliveryController,
  SellerTrackingController,
} from './delivery.controller.js';

/** Delivery tariffs, pickup points and shipment tracking (ADR 0019). */
@Module({ controllers: [DeliveryController, SellerTrackingController, AdminDeliveryController] })
export class DeliveryModule {}
