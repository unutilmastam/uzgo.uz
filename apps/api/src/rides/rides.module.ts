import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { DriversService } from './drivers.service.js';
import { RidesAdminService } from './rides-admin.service.js';
import {
  AdminDriversController,
  AdminRidesController,
  DriverController,
  RidesController,
} from './rides.controller.js';
import { RidesJobs } from './rides.jobs.js';
import { RidesService } from './rides.service.js';

/** UZGO Go: drivers and rides (ADR 0025). */
@Module({
  imports: [PaymentsModule],
  controllers: [RidesController, DriverController, AdminDriversController, AdminRidesController],
  providers: [RidesService, DriversService, RidesAdminService, RidesJobs],
})
export class RidesModule {}
