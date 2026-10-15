import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  geocodeQuerySchema,
  type RestaurantDetail,
  restaurantListQuerySchema,
  reverseGeocodeQuerySchema,
} from '@uzgo/contracts';
import { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { SlugPipe } from '../common/slug.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { GEOCODER, type GeocodingProvider } from './geocoder.js';
import { RestaurantsService } from './restaurants.service.js';

const pointQuery = z
  .strictObject({
    lat: z.coerce.number().min(37).max(46).optional(),
    lng: z.coerce.number().min(55).max(74).optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'lat and lng go together');

/** Public UZGO Food catalogue and address search (ADR 0024). */
@ApiTags('food')
@Public()
@Controller('food')
export class FoodPublicController {
  constructor(
    private readonly restaurants: RestaurantsService,
    @Inject(GEOCODER) private readonly geocoder: GeocodingProvider,
  ) {}

  /** Restaurants; with a location: nearest first, delivery fee and ETA for that point. */
  @Get('restaurants')
  @Header('Cache-Control', 'private, max-age=30')
  list(
    @Query(new ZodValidationPipe(restaurantListQuerySchema))
    query: z.output<typeof restaurantListQuerySchema>,
  ) {
    return this.restaurants.list(query);
  }

  @Get('restaurants/:slug')
  @Header('Cache-Control', 'private, max-age=30')
  detail(
    @Param('slug', SlugPipe) slug: string,
    @Query(new ZodValidationPipe(pointQuery)) query: z.output<typeof pointQuery>,
  ): Promise<RestaurantDetail> {
    const point =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : null;
    return this.restaurants.detail(slug, point);
  }

  /** Address → coordinates (OpenStreetMap, rate-limited upstream: keep it low here too). */
  @Get('geocode')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async geocode(
    @Query(new ZodValidationPipe(geocodeQuerySchema)) query: z.output<typeof geocodeQuerySchema>,
  ) {
    return { items: await this.geocoder.search(query.q, query.locale) };
  }

  @Get('reverse')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async reverse(
    @Query(new ZodValidationPipe(reverseGeocodeQuerySchema))
    query: z.output<typeof reverseGeocodeQuerySchema>,
  ) {
    return { label: await this.geocoder.reverse(query, query.locale) };
  }
}
