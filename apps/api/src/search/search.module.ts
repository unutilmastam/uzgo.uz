import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { SearchController } from './search.controller.js';
import { UnifiedSearchService } from './unified-search.service.js';

/** Unified search across the marketplace and UZGO Food (ADR 0026). */
@Module({
  imports: [CatalogModule],
  controllers: [SearchController],
  providers: [UnifiedSearchService],
  exports: [UnifiedSearchService],
})
export class SearchModule {}
