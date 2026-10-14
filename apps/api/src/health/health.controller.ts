import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import {
  type HealthLive,
  type HealthReady,
  healthLiveSchema,
  healthReadySchema,
} from '@uzgo/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const liveJsonSchema = z.toJSONSchema(healthLiveSchema) as Record<string, unknown>;
const readyJsonSchema = z.toJSONSchema(healthReadySchema) as Record<string, unknown>;

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOkResponse({ description: 'The process is running', schema: liveJsonSchema })
  live(): HealthLive {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Ready to serve traffic', schema: readyJsonSchema })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable', schema: readyJsonSchema })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthReady> {
    const databaseUp = await this.prisma.isReachable();
    if (!databaseUp) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: databaseUp ? 'ok' : 'error',
      checks: { database: databaseUp ? 'up' : 'down' },
    };
  }
}
