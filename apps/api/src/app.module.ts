import { Module } from '@nestjs/common';
import type { Request } from 'express';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AlertsModule } from './alerts/alerts.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CartModule } from './cart/cart.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { OriginGuard } from './auth/origin.guard.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { rateLimitTracker } from './common/http.js';
import { LoggerModule } from './common/logger.module.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { GeoModule } from './geo/geo.module.js';
import { HealthModule } from './health/health.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SellerModule } from './seller/seller.module.js';
import { SmsModule } from './sms/sms.module.js';
import { StorageModule } from './storage/storage.module.js';
import { StoresModule } from './stores/stores.module.js';
import { TestSupportModule } from './testing/test-support.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    AlertsModule,
    PrismaModule,
    // In-memory per-IP rate limit (SPEC §17); Redis only via ADR for multiple instances.
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        // Browser e2e only (env validation allows it only with NODE_ENV=test).
        skipIf: () => env.RATE_LIMIT_DISABLED,
        getTracker: (req: Record<string, unknown>) =>
          rateLimitTracker(req as unknown as Request, env.INTERNAL_API_TOKEN),
      }),
    }),
    AuditModule,
    SmsModule,
    StorageModule,
    HealthModule,
    GeoModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    LedgerModule,
    DeliveryModule,
    NotificationsModule,
    StoresModule,
    SellerModule,
    AdminModule,
    AuthModule,
    UsersModule,
    TestSupportModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Order matters: origin check → rate limit → authentication/roles.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
