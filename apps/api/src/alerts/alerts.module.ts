import { Global, Module } from '@nestjs/common';
import { AlertsService } from './alerts.service.js';

@Global()
@Module({ providers: [AlertsService], exports: [AlertsService] })
export class AlertsModule {}
