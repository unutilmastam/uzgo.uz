import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type CategoryDetail,
  type CategoryNode,
  type ProductDetail,
  type ProductList,
  type ProductSearchQuery,
  productSearchQuerySchema,
  type StoreDetail,
} from '@uzgo/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SearchService } from '../search/search.service.js';
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
    private readonly searchService: SearchService,
  ) {}

  /** Listing + search with filters, sort and pagination (in-stock products only). */
  @Get('products')
  @Header('Cache-Control', 'public, max-age=30')
  search(
    @Query(new ZodValidationPipe(productSearchQuerySchema)) query: ProductSearchQuery,
  ): Promise<ProductList> {
    return this.searchService.search(query);
  }

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
