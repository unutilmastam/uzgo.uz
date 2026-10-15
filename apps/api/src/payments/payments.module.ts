import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { ClickController } from './click/click.controller.js';
import { ClickService } from './click/click.service.js';
import { PaymeController } from './payme/payme.controller.js';
import { PaymeService } from './payme/payme.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsJobs } from './payments.jobs.js';
import { PaymentsService } from './payments.service.js';

/** Online payments (ADR 0017): provider-independent core + adapters. */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, PaymeController, ClickController],
  providers: [PaymentsService, PaymentsJobs, PaymeService, ClickService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
