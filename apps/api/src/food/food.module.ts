import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AdminCouriersController, AdminRestaurantsController } from './admin-food.controller.js';
import { SellerModule } from '../seller/seller.module.js';
import { CourierController } from './courier.controller.js';
import { CourierService } from './courier.service.js';
import { CouriersAdminService } from './couriers.service.js';
import { FoodOrdersController, RestaurantTeamController } from './food-orders.controller.js';
import { FoodOrdersService } from './food-orders.service.js';
import { FoodJobs } from './food.jobs.js';
import { FoodPublicController } from './food.controller.js';
import { FakeGeocoder, GEOCODER, type GeocodingProvider, NominatimGeocoder } from './geocoder.js';
import { RestaurantsService } from './restaurants.service.js';

/** UZGO Food: restaurants, menus, food orders, couriers (ADR 0024). */
@Module({
  imports: [SellerModule],
  controllers: [
    FoodPublicController,
    FoodOrdersController,
    RestaurantTeamController,
    CourierController,
    AdminRestaurantsController,
    AdminCouriersController,
  ],
  providers: [
    RestaurantsService,
    FoodOrdersService,
    FoodJobs,
    CouriersAdminService,
    CourierService,
    {
      provide: GEOCODER,
      inject: [ENV],
      useFactory: (env: Env): GeocodingProvider =>
        env.NODE_ENV === 'test'
          ? new FakeGeocoder()
          : new NominatimGeocoder(
              env.NOMINATIM_URL.replace(/\/+$/, ''),
              `UZGO/1.0 (${env.GEOCODER_CONTACT ?? 'development'})`,
            ),
    },
  ],
  exports: [RestaurantsService, FoodOrdersService, GEOCODER],
})
export class FoodModule {}
