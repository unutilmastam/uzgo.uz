import { Body, Controller, HttpCode, HttpStatus, Inject, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../auth/decorators.js';
import { clientIp } from '../../common/http.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PaymeError, PaymeService } from './payme.service.js';

/**
 * Payme Merchant API endpoint (Payme → UZGO). Always answers HTTP 200 with a
 * JSON-RPC result or error, as the protocol requires. Authenticated by the
 * merchant key (Basic auth) and, when configured, Payme's source IPs.
 * Not rate-limited per IP: Payme's servers must never be throttled.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('payments/payme')
export class PaymeController {
  private readonly logger = new Logger(PaymeController.name);

  constructor(
    private readonly payme: PaymeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Body() body: unknown, @Req() req: Request): Promise<unknown> {
    const rpc = (body && typeof body === 'object' ? body : {}) as {
      id?: unknown;
      method?: unknown;
      params?: unknown;
    };
    const id = typeof rpc.id === 'number' || typeof rpc.id === 'string' ? rpc.id : null;
    try {
      if (
        this.env.PAYME_ALLOWED_IPS.length > 0 &&
        !this.env.PAYME_ALLOWED_IPS.includes(clientIp(req))
      ) {
        this.payme.authorize(undefined);
      }
      this.payme.authorize(req.headers.authorization);
      const result = await this.payme.dispatch(rpc.method, rpc.params);
      return { jsonrpc: '2.0', id, result };
    } catch (e) {
      if (e instanceof PaymeError) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: e.code, message: e.text, ...(e.data ? { data: e.data } : {}) },
        };
      }
      this.logger.error({ err: e, method: rpc.method }, 'Payme request failed');
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32400,
          message: { ru: 'Системная ошибка', uz: 'Tizim xatosi', en: 'System error' },
        },
      };
    }
  }
}
