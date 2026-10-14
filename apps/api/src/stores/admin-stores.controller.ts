import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AdminStore,
  type AdminStoreList,
  adminStoreListQuerySchema,
  storeReviewReasonSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { clientIp } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { type StoreAction, StoresService } from './stores.service.js';

const metaOf = (req: Request) => ({
  ip: clientIp(req),
  requestId: typeof req.id === 'string' ? req.id : undefined,
});
const uuid = new ParseUUIDPipe({ version: '7' });
type Reason = z.infer<typeof storeReviewReasonSchema>;

/**
 * Store review. Moderators approve or reject applications; suspending and
 * reactivating a live store is an admin decision.
 */
@ApiTags('admin')
@Controller('admin/stores')
@Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminStoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminStoreListQuerySchema))
    query: z.output<typeof adminStoreListQuerySchema>,
  ): Promise<AdminStoreList> {
    return this.stores.adminList(query.status, query.page);
  }

  @Get(':id')
  async get(@Param('id', uuid) id: string): Promise<{ store: AdminStore }> {
    return { store: await this.stores.adminGet(id) };
  }

  private async act(
    action: StoreAction,
    id: string,
    auth: AuthContext,
    reason: string | null,
    req: Request,
  ): Promise<{ store: AdminStore }> {
    return { store: await this.stores.transition(id, action, auth.user.id, reason, metaOf(req)) };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', uuid) id: string, @CurrentAuth() auth: AuthContext, @Req() req: Request) {
    return this.act('approve', id, auth, null, req);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(storeReviewReasonSchema)) body: Reason,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.act('reject', id, auth, body.reason, req);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  suspend(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(storeReviewReasonSchema)) body: Reason,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.act('suspend', id, auth, body.reason, req);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  reactivate(@Param('id', uuid) id: string, @CurrentAuth() auth: AuthContext, @Req() req: Request) {
    return this.act('reactivate', id, auth, null, req);
  }
}
