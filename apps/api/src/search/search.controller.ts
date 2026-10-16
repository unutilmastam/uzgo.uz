import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type SearchAll, searchAllQuerySchema } from '@uzgo/contracts';
import type { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UnifiedSearchService } from './unified-search.service.js';

@ApiTags('search')
@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly search: UnifiedSearchService) {}

  /** Products, restaurants and dishes for one query (ADR 0026). */
  @Get('all')
  @Header('Cache-Control', 'public, max-age=30')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  all(
    @Query(new ZodValidationPipe(searchAllQuerySchema))
    query: z.output<typeof searchAllQuerySchema>,
  ): Promise<SearchAll> {
    return this.search.searchAll(query.q);
  }
}
