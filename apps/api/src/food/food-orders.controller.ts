import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AdminRestaurant,
  type FoodCheckoutInput,
  type FoodQuote,
  type FoodQuoteRequest,
  foodCheckoutSchema,
  foodQuoteRequestSchema,
  idempotencyKeySchema,
  menuAvailabilitySchema,
  type OrderView,
  type RestaurantOrder,
  restaurantOrdersQuerySchema,
  restaurantSettingsSchema,
} from '@uzgo/contracts';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, Public } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StoreAccessService } from '../seller/store-access.service.js';
import { FoodOrdersService } from './food-orders.service.js';
import { RestaurantsService } from './restaurants.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Customers: price a basket and order (ADR 0024). */
@ApiTags('food')
@Controller('food')
export class FoodOrdersController {
  constructor(private readonly food: FoodOrdersService) {}

  /** Public: guests see prices before signing in (nothing personal in or out). */
  @Public()
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  quote(
    @Body(new ZodValidationPipe(foodQuoteRequestSchema)) body: FoodQuoteRequest,
  ): Promise<FoodQuote> {
    return this.food.quote(body);
  }

  /** Requires an Idempotency-Key (UUID) header, like marketplace checkout. */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(
    @CurrentAuth() auth: AuthContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(foodCheckoutSchema)) body: FoodCheckoutInput,
  ): Promise<{ order: OrderView }> {
    const parsed = idempotencyKeySchema.safeParse(key);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header (UUID) is required',
      );
    }
    return { order: await this.food.checkout(auth.user.id, body, parsed.data) };
  }
}

/**
 * Restaurant team (store members of a RESTAURANT): orders, pause, sold-out
 * dishes. Status changes use the shared shipment transition route.
 */
@ApiTags('food')
@Controller('restaurant/:storeId')
export class RestaurantTeamController {
  constructor(
    private readonly access: StoreAccessService,
    private readonly food: FoodOrdersService,
    private readonly restaurants: RestaurantsService,
  ) {}

  @Get()
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
  ): Promise<{ restaurant: AdminRestaurant }> {
    await this.access.require(auth.user.id, storeId, { kind: 'RESTAURANT' });
    return { restaurant: await this.restaurants.adminGet(storeId) };
  }

  @Get('orders')
  async orders(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Query(new ZodValidationPipe(restaurantOrdersQuerySchema))
    query: z.output<typeof restaurantOrdersQuerySchema>,
  ): Promise<{ items: RestaurantOrder[] }> {
    await this.access.require(auth.user.id, storeId, { kind: 'RESTAURANT' });
    return { items: await this.food.teamOrders(storeId, query.scope) };
  }

  @Patch('settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  async settings(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Body(new ZodValidationPipe(restaurantSettingsSchema))
    body: z.output<typeof restaurantSettingsSchema>,
  ): Promise<void> {
    await this.access.require(auth.user.id, storeId, { kind: 'RESTAURANT', write: true });
    await this.food.setAccepting(storeId, body.acceptingOrders);
  }

  @Patch('menu-items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async availability(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodValidationPipe(menuAvailabilitySchema))
    body: z.output<typeof menuAvailabilitySchema>,
  ): Promise<void> {
    await this.access.require(auth.user.id, storeId, { kind: 'RESTAURANT', write: true });
    await this.food.setAvailability(storeId, itemId, body.available);
  }
}
