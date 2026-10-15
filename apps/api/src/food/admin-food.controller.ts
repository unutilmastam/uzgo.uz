import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AdminRestaurant,
  type CreateRestaurant,
  courierSettlementSchema,
  createCourierSchema,
  createRestaurantSchema,
  type MenuCategoryInput,
  type MenuItemInput,
  menuCategoryInputSchema,
  menuItemInputSchema,
  PRODUCT_IMAGE_LIMITS,
  type UpdateMenuItem,
  type UpdateRestaurant,
  updateCourierSchema,
  updateMenuItemSchema,
  updateRestaurantSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { metaOf } from '../admin/meta.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { CouriersAdminService } from './couriers.service.js';
import { RestaurantsService } from './restaurants.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });
type Result = Promise<{ restaurant: AdminRestaurant }>;

const imageUpload = FileInterceptor('file', {
  // In memory only (never on disk), one file, hard size limit.
  limits: { fileSize: PRODUCT_IMAGE_LIMITS.maxBytes, files: 1, fields: 0, parts: 1 },
});
const requireFile = (file: { buffer: Buffer } | undefined) => {
  if (!file) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Attach an image file');
  }
  return file.buffer;
};

/** Staff manage restaurants and their menus (ADR 0024: no self-service). */
@ApiTags('admin')
@Controller('admin/restaurants')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminRestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  list() {
    return this.restaurants.adminList();
  }

  @Get(':id')
  async get(@Param('id', uuid) id: string): Result {
    return { restaurant: await this.restaurants.adminGet(id) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createRestaurantSchema)) body: CreateRestaurant,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    return { restaurant: await this.restaurants.create(body, auth.user.id, metaOf(req)) };
  }

  @Patch(':id')
  async update(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateRestaurantSchema)) body: UpdateRestaurant,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    return { restaurant: await this.restaurants.update(id, body, auth.user.id, metaOf(req)) };
  }

  @Post(':id/cover')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(imageUpload)
  async cover(
    @Param('id', uuid) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    const body = requireFile(file);
    return {
      restaurant: await this.restaurants.setImage(id, null, body, auth.user.id, metaOf(req)),
    };
  }

  @Post(':id/menu/categories')
  async addCategory(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(menuCategoryInputSchema)) body: MenuCategoryInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    return { restaurant: await this.restaurants.addCategory(id, body, auth.user.id, metaOf(req)) };
  }

  @Patch(':id/menu/categories/:categoryId')
  async updateCategory(
    @Param('id', uuid) id: string,
    @Param('categoryId', uuid) categoryId: string,
    @Body(new ZodValidationPipe(menuCategoryInputSchema)) body: MenuCategoryInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    return {
      restaurant: await this.restaurants.updateCategory(
        id,
        categoryId,
        body,
        auth.user.id,
        metaOf(req),
      ),
    };
  }

  @Post(':id/menu/items')
  async addItem(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(menuItemInputSchema)) body: MenuItemInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    return { restaurant: await this.restaurants.addItem(id, body, auth.user.id, metaOf(req)) };
  }

  @Patch(':id/menu/items/:itemId')
  async updateItem(
    @Param('id', uuid) id: string,
    @Param('itemId', uuid) itemId: string,
    @Body(new ZodValidationPipe(updateMenuItemSchema)) body: UpdateMenuItem,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    return {
      restaurant: await this.restaurants.updateItem(id, itemId, body, auth.user.id, metaOf(req)),
    };
  }

  @Post(':id/menu/items/:itemId/image')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(imageUpload)
  async itemImage(
    @Param('id', uuid) id: string,
    @Param('itemId', uuid) itemId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Result {
    const body = requireFile(file);
    return {
      restaurant: await this.restaurants.setImage(id, itemId, body, auth.user.id, metaOf(req)),
    };
  }
}

/** Staff manage couriers and their cash/payout settlements. */
@ApiTags('admin')
@Controller('admin/couriers')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminCouriersController {
  constructor(private readonly couriers: CouriersAdminService) {}

  @Get()
  list() {
    return this.couriers.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCourierSchema)) body: z.output<typeof createCourierSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.couriers.create(body, auth.user.id, metaOf(req));
  }

  @Patch(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('userId', uuid) userId: string,
    @Body(new ZodValidationPipe(updateCourierSchema)) body: z.output<typeof updateCourierSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.couriers.update(userId, body, auth.user.id, metaOf(req));
  }

  @Post(':userId/settlements')
  @HttpCode(HttpStatus.OK)
  settle(
    @Param('userId', uuid) userId: string,
    @Body(new ZodValidationPipe(courierSettlementSchema))
    body: z.output<typeof courierSettlementSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.couriers.settle(userId, body, auth.user.id, metaOf(req));
  }
}
