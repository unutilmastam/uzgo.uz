import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CartModule } from './cart/cart.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { OriginGuard } from './auth/origin.guard.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { LoggerModule } from './common/logger.module.js';
import { ConfigModule } from './config/config.module.js';
import { GeoModule } from './geo/geo.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SmsModule } from './sms/sms.module.js';
import { StorageModule } from './storage/storage.module.js';
import { StoresModule } from './stores/stores.module.js';
import { TestSupportModule } from './testing/test-support.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    // In-memory per-IP rate limit (SPEC §17); Redis only via ADR for multiple instances.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    AuditModule,
    SmsModule,
    StorageModule,
    HealthModule,
    GeoModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    StoresModule,
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
