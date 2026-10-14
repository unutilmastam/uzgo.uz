import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CategoryDetail, CategoryNode, ProductDetail, StoreDetail } from '@uzgo/contracts';
import { Public } from '../auth/decorators.js';
import { SlugPipe } from '../common/slug.pipe.js';
import { CatalogService } from './catalog.service.js';
import { ProductsService } from './products.service.js';

@ApiTags('catalog')
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly products: ProductsService,
  ) {}

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

  @Get('products/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  async product(@Param('slug', SlugPipe) slug: string): Promise<{ product: ProductDetail }> {
    return { product: await this.products.detail(slug) };
  }

  @Get('stores/:slug')
  @Header('Cache-Control', 'public, max-age=300')
  async store(@Param('slug', SlugPipe) slug: string): Promise<{ store: StoreDetail }> {
    return { store: await this.products.store(slug) };
  }
}
