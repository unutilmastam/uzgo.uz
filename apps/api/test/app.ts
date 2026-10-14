import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const TEST_ORIGIN = 'http://localhost:3000';

/** Boots the real application (real PostgreSQL) with the production HTTP pipeline. */
export async function createTestApp(
  overrides: { prisma?: Partial<PrismaService> } = {},
): Promise<NestExpressApplication> {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Set DATABASE_URL or TEST_DATABASE_URL for integration tests');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: TEST_ORIGIN,
    BODY_LIMIT: '1kb',
  });

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (overrides.prisma)
    builder = builder.overrideProvider(PrismaService).useValue(overrides.prisma);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
