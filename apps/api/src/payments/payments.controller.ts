import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type OrderView, type PaymentMethod } from '@uzgo/contracts';
import { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, Public } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { orderNumber } from '../orders/orders.controller.js';
import { OrdersService } from '../orders/orders.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { paymentLink } from './payment-links.js';
import { enabledPaymentMethods, ONLINE_METHODS } from './payment-methods.js';
import { PaymentsService } from './payments.service.js';

const localeQuery = z.strictObject({ locale: z.enum(['uz', 'ru']).default('uz') });
const devOutcome = z.strictObject({ outcome: z.enum(['success', 'cancel']) });

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get('payments/methods')
  methods(): { items: PaymentMethod[] } {
    return { items: enabledPaymentMethods(this.env) };
  }

  /** The provider page where the order's owner pays (only while it is collectable). */
  @Get('orders/:number/payment-link')
  async link(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
    @Query(new ZodValidationPipe(localeQuery)) query: z.output<typeof localeQuery>,
  ): Promise<{ url: string }> {
    const order = await this.payments.findOrderByNumber(orderNumber(number));
    if (!order || order.userId !== auth.user.id) throw notFound();
    if (!this.payments.isCollectable(order, order.paymentMethod)) {
      throw new AppException(HttpStatus.CONFLICT, 'ORDER_NOT_PAYABLE', 'Order is not payable');
    }
    const url = paymentLink(this.env, order.paymentMethod, order, query.locale);
    if (!url || !enabledPaymentMethods(this.env).includes(order.paymentMethod)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PAYMENT_METHOD_UNAVAILABLE',
        'This payment method is not available',
      );
    }
    return { url };
  }

  /** Cancels the whole unpaid online order (stock is released). */
  @Post('orders/:number/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
  ): Promise<{ order: OrderView }> {
    const order = await this.payments.findOrderByNumber(orderNumber(number));
    if (!order || order.userId !== auth.user.id) throw notFound();
    const done = await this.prisma.$transaction((tx) =>
      this.payments.cancelUnpaidOrder(tx, order.id, {
        userId: auth.user.id,
        reason: 'customer_cancelled',
      }),
    );
    if (!done) {
      throw new AppException(HttpStatus.CONFLICT, 'ORDER_NOT_PAYABLE', 'Only unpaid orders');
    }
    return { order: await this.orders.getForCustomer(auth.user.id, order.number) };
  }

  /**
   * DEVELOPMENT / TESTS ONLY — simulated provider. Answers 404 unless
   * DEV_PAYMENTS_ENABLED (refused in production by env validation).
   */
  @Post('payments/dev/:number')
  @HttpCode(HttpStatus.OK)
  async devPay(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
    @Body(new ZodValidationPipe(devOutcome)) body: z.infer<typeof devOutcome>,
  ): Promise<{ order: OrderView }> {
    if (!enabledPaymentMethods(this.env).includes('DEV_ONLINE')) throw notFound();
    const order = await this.payments.findOrderByNumber(orderNumber(number));
    if (!order || order.userId !== auth.user.id || !ONLINE_METHODS.has(order.paymentMethod)) {
      throw notFound();
    }
    if (order.paymentMethod !== 'DEV_ONLINE') throw notFound();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.payments.lockOrder(tx, order.id);
      if (!locked || !this.payments.isCollectable(locked, 'DEV_ONLINE')) {
        throw new AppException(HttpStatus.CONFLICT, 'ORDER_NOT_PAYABLE', 'Order is not payable');
      }
      const attempt = await tx.paymentAttempt.create({
        data: {
          orderId: order.id,
          method: 'DEV_ONLINE',
          amountTiyin: locked.totalTiyin,
          providerTxId: `dev-${randomUUID()}`,
        },
      });
      if (body.outcome === 'success') await this.payments.capture(tx, attempt.id);
      else await this.payments.cancelAttempt(tx, attempt.id, null, null);
    });
    return { order: await this.orders.getForCustomer(auth.user.id, order.number) };
  }
}
