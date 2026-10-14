import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type CreateProduct,
  type CreateVariant,
  PRODUCT_IMAGE_LIMITS,
  type SellerProduct,
  type SellerProductList,
  type UpdateProduct,
  type UpdateVariant,
  createProductSchema,
  createVariantSchema,
  imageOrderSchema,
  sellerProductListQuerySchema,
  updateProductSchema,
  updateVariantSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { clientIp } from '../common/http.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type Actor, SellerProductsService } from './seller-products.service.js';
import { StoreAccessService } from './store-access.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const metaOf = (req: Request) => ({
  ip: clientIp(req),
  requestId: typeof req.id === 'string' ? req.id : undefined,
});
type Result = Promise<{ product: SellerProduct }>;

/** Store members (owner and staff) manage the store's catalogue. */
@ApiTags('seller')
@Controller('seller/stores/:storeId/products')
export class SellerProductsController {
  constructor(
    private readonly products: SellerProductsService,
    private readonly access: StoreAccessService,
  ) {}

  private async actor(auth: AuthContext, storeId: string, write = true): Promise<Actor> {
    const access = await this.access.require(auth.user.id, storeId, { write });
    return { userId: auth.user.id, storeId, status: access.status };
  }

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Query(new ZodValidationPipe(sellerProductListQuerySchema))
    query: z.output<typeof sellerProductListQuerySchema>,
  ): Promise<SellerProductList> {
    await this.actor(auth, storeId, false);
    return this.products.list(storeId, query.status, query.page);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProduct,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.create(actor, body, metaOf(req)) };
  }

  @Get(':productId')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
  ): Result {
    await this.actor(auth, storeId, false);
    return { product: await this.products.get(storeId, productId) };
  }

  @Patch(':productId')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProduct,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.update(actor, productId, body, metaOf(req)) };
  }

  @Post(':productId/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.submit(actor, productId, metaOf(req)) };
  }

  @Post(':productId/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.setArchived(actor, productId, true, metaOf(req)) };
  }

  @Post(':productId/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.setArchived(actor, productId, false, metaOf(req)) };
  }

  @Post(':productId/variants')
  async addVariant(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Body(new ZodValidationPipe(createVariantSchema)) body: CreateVariant,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.addVariant(actor, productId, body, metaOf(req)) };
  }

  @Patch(':productId/variants/:variantId')
  async updateVariant(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Param('variantId', uuid) variantId: string,
    @Body(new ZodValidationPipe(updateVariantSchema)) body: UpdateVariant,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return {
      product: await this.products.updateVariant(actor, productId, variantId, body, metaOf(req)),
    };
  }

  /**
   * Multipart upload (field "file"). Kept in memory with hard limits, then
   * decoded and re-encoded server-side; the client's type and name are ignored.
   */
  @Post(':productId/images')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // No `dest`/`storage`: multer keeps the file in memory (never on disk).
      limits: { fileSize: PRODUCT_IMAGE_LIMITS.maxBytes, files: 1, fields: 0, parts: 1 },
    }),
  )
  async addImage(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() req: Request,
  ): Result {
    if (!file) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Attach an image file');
    }
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.addImage(actor, productId, file.buffer, metaOf(req)) };
  }

  @Delete(':productId/images/:imageId')
  async removeImage(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Param('imageId', uuid) imageId: string,
    @Req() req: Request,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.removeImage(actor, productId, imageId, metaOf(req)) };
  }

  @Put(':productId/images/order')
  async reorderImages(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Param('productId', uuid) productId: string,
    @Body(new ZodValidationPipe(imageOrderSchema)) body: z.infer<typeof imageOrderSchema>,
  ): Result {
    const actor = await this.actor(auth, storeId);
    return { product: await this.products.reorderImages(actor, productId, body.ids) };
  }
}
