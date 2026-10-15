import { Body, Controller, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type RegisterPushDevice,
  registerPushDeviceSchema,
  type UnregisterPushDevice,
  unregisterPushDeviceSchema,
} from '@uzgo/contracts';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Phones that receive push notifications (ADR 0022). A device belongs to the
 * session that registered it: a token moving to another account or session
 * is re-bound, so it never receives the previous owner's notifications.
 */
@ApiTags('push')
@Controller('push-devices')
export class PushDevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(registerPushDeviceSchema)) body: RegisterPushDevice,
  ): Promise<void> {
    const binding = { userId: auth.user.id, sessionId: auth.sessionId, platform: body.platform };
    await this.prisma.pushDevice.upsert({
      where: { token: body.token },
      create: { token: body.token, ...binding },
      update: binding,
    });
  }

  /** Only the caller's own device can be removed (others are silently ignored). */
  @Post('unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(unregisterPushDeviceSchema)) body: UnregisterPushDevice,
  ): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { token: body.token, userId: auth.user.id } });
  }
}
