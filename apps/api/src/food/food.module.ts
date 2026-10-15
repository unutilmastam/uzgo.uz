import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AdminCouriersController, AdminRestaurantsController } from './admin-food.controller.js';
import { CouriersAdminService } from './couriers.service.js';
import { FoodPublicController } from './food.controller.js';
import { FakeGeocoder, GEOCODER, type GeocodingProvider, NominatimGeocoder } from './geocoder.js';
import { RestaurantsService } from './restaurants.service.js';

/** UZGO Food: restaurants, menus, food orders, couriers (ADR 0024). */
@Module({
  controllers: [FoodPublicController, AdminRestaurantsController, AdminCouriersController],
  providers: [
    RestaurantsService,
    CouriersAdminService,
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
  exports: [RestaurantsService, GEOCODER],
})
export class FoodModule {}
