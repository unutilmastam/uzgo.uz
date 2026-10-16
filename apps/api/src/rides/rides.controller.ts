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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  adminDriverListQuerySchema,
  adminRideCancelSchema,
  adminRideListQuerySchema,
  driverActionInputSchema,
  driverApplicationSchema,
  driverLocationSchema,
  type DriverMe,
  driverReviewSchema,
  driverSettlementSchema,
  driverStatusInputSchema,
  idempotencyKeySchema,
  rideCancelSchema,
  type RideQuote,
  type RideQuoteRequest,
  rideQuoteRequestSchema,
  type RideRequestInput,
  rideRequestSchema,
  type RideView,
  updateDriverSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { metaOf } from '../admin/meta.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, Public, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { orderNumber } from '../orders/orders.controller.js';
import { DriversService } from './drivers.service.js';
import { RidesAdminService } from './rides-admin.service.js';
import { RidesService } from './rides.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Riders (ADR 0025). */
@ApiTags('rides')
@Controller('rides')
export class RidesController {
  constructor(private readonly rides: RidesService) {}

  /** Public: guests see prices before signing in (nothing personal in or out). */
  @Public()
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  quote(
    @Body(new ZodValidationPipe(rideQuoteRequestSchema)) body: RideQuoteRequest,
  ): Promise<RideQuote> {
    return this.rides.quote(body);
  }

  /** Requires an Idempotency-Key (UUID) header, like checkout. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async request(
    @CurrentAuth() auth: AuthContext,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(rideRequestSchema)) body: RideRequestInput,
  ): Promise<{ ride: RideView }> {
    const parsed = idempotencyKeySchema.safeParse(key);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key header (UUID) is required',
      );
    }
    return { ride: await this.rides.request(auth.user.id, body, parsed.data) };
  }

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.rides.list(auth.user.id);
  }

  @Get(':number')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
  ): Promise<{ ride: RideView }> {
    return { ride: await this.rides.get(auth.user.id, orderNumber(number)) };
  }

  @Post(':number/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('number') number: string,
    @Body(new ZodValidationPipe(rideCancelSchema)) body: z.output<typeof rideCancelSchema>,
  ): Promise<{ ride: RideView }> {
    return { ride: await this.rides.cancel(auth.user.id, orderNumber(number), body.reason) };
  }
}

/** Drivers: application (any account) and driver mode (approved drivers). */
@ApiTags('driver')
@Controller('driver')
export class DriverController {
  constructor(private readonly drivers: DriversService) {}

  @Get('application')
  application(@CurrentAuth() auth: AuthContext) {
    return this.drivers.application(auth.user.id);
  }

  @Put('application')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  apply(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(driverApplicationSchema))
    body: z.output<typeof driverApplicationSchema>,
  ) {
    return this.drivers.apply(auth.user.id, body);
  }

  @Get('me')
  me(@CurrentAuth() auth: AuthContext): Promise<DriverMe> {
    return this.drivers.me(auth.user.id);
  }

  @Put('status')
  status(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(driverStatusInputSchema))
    body: z.output<typeof driverStatusInputSchema>,
  ): Promise<DriverMe> {
    return this.drivers.setStatus(auth.user.id, body);
  }

  /** The app sends its position at most every 5 seconds while online. */
  @Put('location')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async location(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(driverLocationSchema)) body: z.output<typeof driverLocationSchema>,
  ): Promise<void> {
    await this.drivers.location(auth.user.id, body);
  }

  @Get('offers')
  offers(@CurrentAuth() auth: AuthContext) {
    return this.drivers.offers(auth.user.id);
  }

  @Post('offers/:id/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  accept(@CurrentAuth() auth: AuthContext, @Param('id', uuid) id: string): Promise<DriverMe> {
    return this.drivers.accept(auth.user.id, id);
  }

  @Post('rides/:id/action')
  @HttpCode(HttpStatus.OK)
  act(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(driverActionInputSchema))
    body: z.output<typeof driverActionInputSchema>,
  ): Promise<DriverMe> {
    return this.drivers.act(auth.user.id, id, body.action);
  }
}

/** Staff review drivers and settle their money. */
@ApiTags('admin')
@Controller('admin/drivers')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminDriversController {
  constructor(private readonly admin: RidesAdminService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminDriverListQuerySchema))
    query: z.output<typeof adminDriverListQuerySchema>,
  ) {
    return this.admin.listDrivers(query.status);
  }

  @Post(':userId/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  async review(
    @Param('userId', uuid) userId: string,
    @Body(new ZodValidationPipe(driverReviewSchema)) body: z.output<typeof driverReviewSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.admin.review(userId, body, auth.user.id, metaOf(req));
  }

  @Patch(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('userId', uuid) userId: string,
    @Body(new ZodValidationPipe(updateDriverSchema)) body: z.output<typeof updateDriverSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.admin.update(userId, body, auth.user.id, metaOf(req));
  }

  @Post(':userId/settlements')
  @HttpCode(HttpStatus.OK)
  settle(
    @Param('userId', uuid) userId: string,
    @Body(new ZodValidationPipe(driverSettlementSchema))
    body: z.output<typeof driverSettlementSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.admin.settle(userId, body, auth.user.id, metaOf(req));
  }
}

/** Staff see all rides and can cancel an open one. */
@ApiTags('admin')
@Controller('admin/rides')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminRidesController {
  constructor(private readonly admin: RidesAdminService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminRideListQuerySchema))
    query: z.output<typeof adminRideListQuerySchema>,
  ) {
    return this.admin.listRides(query.status);
  }

  @Post(':number/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('number') number: string,
    @Body(new ZodValidationPipe(adminRideCancelSchema))
    body: z.output<typeof adminRideCancelSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.admin.cancelRide(orderNumber(number), body.reason, auth.user.id, metaOf(req));
  }
}
