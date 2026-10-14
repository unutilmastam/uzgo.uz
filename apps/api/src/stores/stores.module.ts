import { Module } from '@nestjs/common';
import { AdminStoresController } from './admin-stores.controller.js';
import { SellerStoresController } from './seller-stores.controller.js';
import { StoresService } from './stores.service.js';

@Module({
  controllers: [SellerStoresController, AdminStoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
