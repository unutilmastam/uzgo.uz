import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { metaOf } from '../admin/meta.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoreAccessService } from '../seller/store-access.service.js';

const settingsSchema = z.strictObject({
  /** Chat id the UZGO bot shows after /start (negative for groups); null turns Telegram off. */
  telegramChatId: z
    .string()
    .regex(/^-?\d{1,20}$/)
    .nullable(),
});

/** Store notification settings (owner only). */
@ApiTags('seller')
@Controller('seller/stores/:storeId/notifications')
export class StoreNotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: StoreAccessService,
  ) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', new ParseUUIDPipe({ version: '7' })) storeId: string,
    @Body(new ZodValidationPipe(settingsSchema)) body: z.infer<typeof settingsSchema>,
    @Req() req: Request,
  ): Promise<void> {
    await this.access.require(auth.user.id, storeId, { owner: true });
    await this.prisma.store.update({
      where: { id: storeId },
      data: { telegramChatId: body.telegramChatId },
    });
    await this.audit.record({
      action: 'store.notifications_changed',
      entityType: 'Store',
      entityId: storeId,
      actorId: auth.user.id,
      metadata: { telegram: body.telegramChatId !== null },
      ...metaOf(req),
    });
  }
}
