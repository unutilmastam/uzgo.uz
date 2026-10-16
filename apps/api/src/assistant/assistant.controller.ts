import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AssistantReply,
  type AssistantStatus,
  assistantChatRequestSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, Public } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AssistantService } from './assistant.service.js';

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Public: whether to show the assistant; signed-in users also get what is left today. */
  @Public()
  @Get('status')
  status(@Req() req: Request): Promise<AssistantStatus> {
    return this.assistant.status(req.auth?.user.id ?? null);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  chat(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(assistantChatRequestSchema))
    body: z.output<typeof assistantChatRequestSchema>,
  ): Promise<AssistantReply> {
    return this.assistant.chat(auth.user.id, body);
  }
}
