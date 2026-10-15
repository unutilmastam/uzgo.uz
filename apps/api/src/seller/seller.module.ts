import { Module } from '@nestjs/common';
import { SellerCatalogController } from './seller-catalog.controller.js';
import { SellerProductsController } from './seller-products.controller.js';
import { SellerProductsService } from './seller-products.service.js';
import { StoreAccessService } from './store-access.service.js';
import { StoreMembersController } from './store-members.controller.js';

@Module({
  controllers: [SellerProductsController, StoreMembersController, SellerCatalogController],
  providers: [SellerProductsService, StoreAccessService],
  exports: [StoreAccessService, SellerProductsService],
})
export class SellerModule {}
