import { Module } from '@nestjs/common';
import { AdminRolesController } from './admin-roles.controller.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, AdminRolesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
