import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AdminOrderList,
  type OrderView,
  adminOrderListQuerySchema,
  transitionSchema,
} from '@uzgo/contracts';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { OrdersService } from '../orders/orders.service.js';
import { PAGE_SIZE } from './meta.js';

const ORDER_NUMBER = /^UZ-\d{4}-\d{6}$/;
const checkNumber = (number: string): string => {
  if (!ORDER_NUMBER.test(number)) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Invalid order number');
  }
  return number;
};

/** Orders overview for operations staff. Every change goes through the order state machine. */
@ApiTags('admin')
@Controller('admin/orders')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminOrderListQuerySchema))
    query: z.output<typeof adminOrderListQuerySchema>,
  ): Promise<AdminOrderList> {
    return this.orders.listForAdmin(
      { status: query.status, number: query.number },
      query.page,
      PAGE_SIZE,
    );
  }

  @Get(':number')
  async get(@Param('number') number: string): Promise<{ order: OrderView }> {
    return { order: await this.orders.getForAdmin(checkNumber(number)) };
  }

  @Post(':number/seller-orders/:sellerOrderId/transition')
  @HttpCode(HttpStatus.OK)
  async transition(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
    @Param('sellerOrderId', new ParseUUIDPipe({ version: '7' })) sellerOrderId: string,
    @Body(new ZodValidationPipe(transitionSchema)) body: z.output<typeof transitionSchema>,
  ): Promise<{ order: OrderView }> {
    return {
      order: await this.orders.transitionAsAdmin(
        auth.user.id,
        checkNumber(number),
        sellerOrderId,
        body,
      ),
    };
  }
}
