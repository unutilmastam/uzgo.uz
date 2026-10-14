import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { REDACTED_LOG_PATHS } from './mask.js';
import { resolveRequestId } from './request-id.js';

/** Structured JSON logging with request ids and secret redaction. */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
          genReqId: resolveRequestId,
          redact: { paths: REDACTED_LOG_PATHS, censor: '[REDACTED]' },
          // Query strings may carry tokens; log the path only.
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              path: req.url.split('?')[0],
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          customProps: () => ({ service: 'uzgo-api' }),
        },
      }),
    }),
  ],
})
export class LoggerModule {}
