import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type SellerStore, type StoreApplication, storeApplicationSchema } from '@uzgo/contracts';
import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { clientIp } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StoresService } from './stores.service.js';

/** Any signed-in user can apply to sell; staff approve the store before it is visible. */
@ApiTags('seller')
@Controller('seller/stores')
export class SellerStoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext): Promise<{ items: SellerStore[] }> {
    return { items: await this.stores.listMine(auth.user.id) };
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async apply(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(storeApplicationSchema)) body: StoreApplication,
    @Req() req: Request,
  ): Promise<{ store: SellerStore }> {
    const store = await this.stores.apply(auth.user.id, body, {
      ip: clientIp(req),
      requestId: typeof req.id === 'string' ? req.id : undefined,
    });
    return { store };
  }
}
