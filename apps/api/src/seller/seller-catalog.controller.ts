import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SellerAttribute } from '@uzgo/contracts';
import { SellerProductsService } from './seller-products.service.js';

/** Reference data for the product form (reads only public catalogue structure). */
@ApiTags('seller')
@Controller('seller/categories')
export class SellerCatalogController {
  constructor(private readonly products: SellerProductsService) {}

  @Get(':id/attributes')
  async attributes(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
  ): Promise<{ items: SellerAttribute[] }> {
    return { items: await this.products.attributesFor(id) };
  }
}
