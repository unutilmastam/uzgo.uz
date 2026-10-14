import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { ProductsService } from './products.service.js';
import { SearchService } from '../search/search.service.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, ProductsService, SearchService],
  exports: [CatalogService, SearchService],
})
export class CatalogModule {}
