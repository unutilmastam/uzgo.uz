import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CheckoutInput,
  checkoutSchema,
  idempotencyKeySchema,
  type OrderView,
  transitionSchema,
} from '@uzgo/contracts';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

export const ORDER_NUMBER = /^UZ-\d{4}-\d{6,}$/;

export function orderNumber(value: string): string {
  if (!ORDER_NUMBER.test(value))
    throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
  return value;
}

@ApiTags('orders')
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Places the order for the whole cart. Requires an Idempotency-Key (UUID) header. */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async checkout(
    @CurrentAuth() auth: AuthContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
  ): Promise<{ order: OrderView }> {
    const parsed = idempotencyKeySchema.safeParse(key);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header (UUID) is required',
      );
    }
    return { order: await this.orders.checkout(auth.user.id, body, parsed.data) };
  }

  @Get('orders')
  async list(@CurrentAuth() auth: AuthContext) {
    return { items: await this.orders.listForCustomer(auth.user.id) };
  }

  @Get('orders/:number')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
  ): Promise<{ order: OrderView }> {
    return { order: await this.orders.getForCustomer(auth.user.id, orderNumber(number)) };
  }

  /** Customer actions on one shipment (cancel while NEW, request a return after delivery). */
  @Post('orders/:number/seller-orders/:sellerOrderId/transition')
  @HttpCode(HttpStatus.OK)
  async customerTransition(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
    @Param('sellerOrderId', new ParseUUIDPipe({ version: '7' })) sellerOrderId: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: z.output<typeof transitionSchema>,
  ): Promise<{ order: OrderView }> {
    return {
      order: await this.orders.transitionAsCustomer(
        auth.user.id,
        orderNumber(number),
        sellerOrderId,
        body,
      ),
    };
  }

  /** Shipments of the stores the caller belongs to (seller panel UI arrives in Phase 5). */
  @Get('seller/orders')
  async sellerOrders(
    @CurrentAuth() auth: AuthContext,
    @Query('storeId', new ParseUUIDPipe({ version: '7', optional: true }))
    storeId: string | undefined,
  ) {
    return { items: await this.orders.listForSeller(auth.user.id, storeId) };
  }

  @Post('seller/seller-orders/:sellerOrderId/transition')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sellerTransition(
    @CurrentAuth() auth: AuthContext,
    @Param('sellerOrderId', new ParseUUIDPipe({ version: '7' })) sellerOrderId: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: z.output<typeof transitionSchema>,
  ): Promise<void> {
    await this.orders.transitionAsSeller(auth.user.id, sellerOrderId, body);
  }
}
