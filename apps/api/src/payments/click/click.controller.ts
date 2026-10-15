import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators.js';
import { type ClickRequest, ClickService } from './click.service.js';

/** Only flat string fields reach the service (anything else is ignored). */
function fields(body: unknown): ClickRequest {
  const out: ClickRequest = {};
  if (!body || typeof body !== 'object') return out;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === 'string' && key.length <= 40 && value.length <= 200) out[key] = value;
  }
  return out;
}

/**
 * Click SHOP API endpoints (Click → UZGO), authenticated by `sign_string`.
 * Errors are answered in Click's format with HTTP 200. Not rate-limited per IP.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('payments/click')
export class ClickController {
  constructor(private readonly click: ClickService) {}

  @Post('prepare')
  @HttpCode(HttpStatus.OK)
  prepare(@Body() body: unknown) {
    return this.click.prepare(fields(body));
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  complete(@Body() body: unknown) {
    return this.click.complete(fields(body));
  }
}
