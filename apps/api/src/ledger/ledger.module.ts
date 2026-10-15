import { Module } from '@nestjs/common';
import { SellerModule } from '../seller/seller.module.js';
import { AdminFinanceController, SellerFinanceController } from './finance.controllers.js';
import { FinanceService } from './finance.service.js';

/** Ledger, refunds and payouts (ADR 0018). */
@Module({
  imports: [SellerModule],
  controllers: [SellerFinanceController, AdminFinanceController],
  providers: [FinanceService],
})
export class LedgerModule {}
