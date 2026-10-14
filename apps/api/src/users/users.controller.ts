import { Body, Controller, Patch, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type CurrentUser, type UpdateProfile, updateProfileSchema } from '@uzgo/contracts';
import type { Request } from 'express';
import { clientIp } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Updates the caller's own profile. Roles and phone can never be changed here. */
  @Patch('me')
  async updateMe(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfile,
    @Req() req: Request,
  ): Promise<{ user: CurrentUser }> {
    const user = await this.users.updateProfile(auth.user.id, body, {
      ip: clientIp(req),
      requestId: typeof req.id === 'string' ? req.id : undefined,
    });
    return { user };
  }
}
