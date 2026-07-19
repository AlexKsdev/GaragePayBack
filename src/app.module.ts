import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CsrfGuard } from './common/guards/csrf.guard';
import { PrismaModule } from './database/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { QuestsModule } from './modules/quests/quests.module';
import { ProductsModule } from './modules/products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AdminModule,
    AuditModule,
    AuthModule,
    UsersModule,
    PaymentsModule,
    QuestsModule,
    ProductsModule,
  ],
  controllers: [AppController],
  // ThrottlerModule.forRoot alone does nothing — without this guard every
  // @Throttle in the codebase is inert, which left login/register/forgot-password
  // with no brute-force protection at all.
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
