import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsJobs } from './payments.jobs.js';
import { PaymentsService } from './payments.service.js';

/** Online payments (ADR 0017): provider-independent core + adapters. */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsJobs],
  exports: [PaymentsService],
})
export class PaymentsModule {}
