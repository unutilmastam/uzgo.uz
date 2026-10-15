import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type CourierMe,
  courierLocationSchema,
  courierStatusInputSchema,
  courierTransitionSchema,
} from '@uzgo/contracts';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CourierService } from './courier.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Courier mode (ADR 0024). Every route checks the courier profile itself. */
@ApiTags('courier')
@Controller('courier')
export class CourierController {
  constructor(private readonly courier: CourierService) {}

  @Get('me')
  me(@CurrentAuth() auth: AuthContext): Promise<CourierMe> {
    return this.courier.me(auth.user.id);
  }

  @Put('status')
  status(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(courierStatusInputSchema))
    body: z.output<typeof courierStatusInputSchema>,
  ): Promise<CourierMe> {
    return this.courier.setStatus(auth.user.id, body);
  }

  /** The app sends its position at most every 10 seconds while online. */
  @Put('location')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async location(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(courierLocationSchema))
    body: z.output<typeof courierLocationSchema>,
  ): Promise<void> {
    await this.courier.location(auth.user.id, body);
  }

  @Get('offers')
  offers(@CurrentAuth() auth: AuthContext) {
    return this.courier.offers(auth.user.id);
  }

  @Post('offers/:id/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  accept(@CurrentAuth() auth: AuthContext, @Param('id', uuid) id: string): Promise<CourierMe> {
    return this.courier.accept(auth.user.id, id);
  }

  @Post('orders/:id/transition')
  @HttpCode(HttpStatus.OK)
  transition(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(courierTransitionSchema))
    body: z.output<typeof courierTransitionSchema>,
  ): Promise<CourierMe> {
    return this.courier.transition(auth.user.id, id, body.to, body.reason);
  }
}
