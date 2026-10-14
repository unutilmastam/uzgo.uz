import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { EnvValidationError, parseEnv } from './config/env.js';

// Local development convenience; production reads real environment variables.
if (process.env.NODE_ENV !== 'production' && existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap(): Promise<void> {
  // Fail fast with a readable message before Nest starts.
  try {
    parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const env = configureApp(app);
  await app.listen(env.PORT, env.HOST);
}

void bootstrap();
