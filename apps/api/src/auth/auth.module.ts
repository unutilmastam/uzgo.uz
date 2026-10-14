import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [UsersModule, CartModule],
  controllers: [AuthController],
  providers: [OtpService, SessionService],
  exports: [SessionService],
})
export class AuthModule {}
