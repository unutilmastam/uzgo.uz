import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';
import { TotpController } from './totp.controller.js';
import { TotpService } from './totp.service.js';

@Module({
  imports: [UsersModule, CartModule],
  controllers: [AuthController, TotpController],
  providers: [OtpService, SessionService, TotpService],
  exports: [SessionService, TotpService],
})
export class AuthModule {}
