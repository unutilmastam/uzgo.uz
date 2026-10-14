import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CategoryDetail, CategoryNode } from '@uzgo/contracts';
import { Public } from '../auth/decorators.js';
import { SlugPipe } from '../common/slug.pipe.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @Header('Cache-Control', 'public, max-age=300')
  async categories(): Promise<{ items: CategoryNode[] }> {
    return { items: await this.catalog.tree() };
  }

  @Get('categories/:slug')
  @Header('Cache-Control', 'public, max-age=300')
  category(@Param('slug', SlugPipe) slug: string): Promise<CategoryDetail> {
    return this.catalog.detail(slug);
  }
}
