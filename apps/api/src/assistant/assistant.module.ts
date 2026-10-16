import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { SearchModule } from '../search/search.module.js';
import { AssistantController } from './assistant.controller.js';
import { ASSISTANT_PROVIDER, type AssistantProvider } from './assistant.provider.js';
import { AssistantService } from './assistant.service.js';
import { ClaudeAssistant, createClaudeClient } from './claude-assistant.js';
import { FakeAssistant } from './fake-assistant.js';

/** The shopping assistant (ADR 0026); off when no provider is configured. */
@Module({
  imports: [CatalogModule, SearchModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    {
      provide: ASSISTANT_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): AssistantProvider | null => {
        if (env.ASSISTANT_PROVIDER === 'fake') return new FakeAssistant();
        if (!env.ANTHROPIC_API_KEY) return null;
        return new ClaudeAssistant(createClaudeClient(env.ANTHROPIC_API_KEY), {
          model: env.ASSISTANT_MODEL,
          effort: env.ASSISTANT_EFFORT,
        });
      },
    },
  ],
})
export class AssistantModule {}
