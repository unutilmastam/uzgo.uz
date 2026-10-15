import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { SellerModule } from '../seller/seller.module.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminProductsController } from './admin-products.controller.js';
import { AdminUsersController } from './admin-users.controller.js';

/** Staff back office. Every controller requires a staff role and the TOTP second factor. */
@Module({
  imports: [AuthModule, OrdersModule, SellerModule],
  controllers: [
    AdminProductsController,
    AdminCatalogController,
    AdminUsersController,
    AdminOrdersController,
    AdminAuditController,
  ],
})
export class AdminModule {}
