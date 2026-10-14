import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/**
 * Applies all HTTP-level configuration. Shared by main.ts and the integration
 * tests so tests exercise exactly the production pipeline.
 */
export function configureApp(app: NestExpressApplication): Env {
  const env = app.get<Env>(ENV);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY);
  app.useBodyParser('json', { limit: env.BODY_LIMIT });
  app.setGlobalPrefix(API_PREFIX);

  // The API only returns JSON: lock the content security policy down completely.
  const apiHeaders = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  // Swagger UI needs its own scripts and inline styles.
  const docsHeaders = helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (env.SWAGGER_ENABLED && req.path.startsWith(`/${DOCS_PATH}`)) {
      docsHeaders(req, res, next);
    } else {
      apiHeaders(req, res, next);
    }
  });

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept-Language', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('UZGO API')
      .setDescription('UZGO Market REST API. Conventions: docs/API.md')
      .setVersion('v1')
      .build();
    SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, config));
  }

  app.enableShutdownHooks();
  return env;
}
