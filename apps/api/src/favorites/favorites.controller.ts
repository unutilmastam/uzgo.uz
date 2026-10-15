import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MAX_FAVORITES, type ProductSummary } from '@uzgo/contracts';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth } from '../auth/decorators.js';
import { visibleProductWhere } from '../catalog/visibility.js';
import { AppException } from '../common/http-exception.filter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from '../search/search.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** The customer's saved products (Phase 9a). Hidden products are skipped, not deleted. */
@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
  ) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext): Promise<{ items: ProductSummary[] }> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId: auth.user.id, product: visibleProductWhere },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    return { items: await this.search.summaries(rows.map((r) => r.productId)) };
  }

  @Get('ids')
  async ids(@CurrentAuth() auth: AuthContext): Promise<{ productIds: string[] }> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId: auth.user.id },
      select: { productId: true },
    });
    return { productIds: rows.map((r) => r.productId) };
  }

  @Put(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async add(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', uuid) productId: string,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...visibleProductWhere },
      select: { id: true },
    });
    if (!product) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Product not found');
    const count = await this.prisma.favorite.count({ where: { userId: auth.user.id } });
    if (count >= MAX_FAVORITES) {
      const exists = await this.prisma.favorite.count({
        where: { userId: auth.user.id, productId },
      });
      if (!exists) {
        throw new AppException(HttpStatus.CONFLICT, 'FAVORITES_LIMIT', 'Too many saved products');
      }
    }
    await this.prisma.favorite.upsert({
      where: { userId_productId: { userId: auth.user.id, productId } },
      create: { userId: auth.user.id, productId },
      update: {},
    });
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('productId', uuid) productId: string,
  ): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId: auth.user.id, productId } });
  }
}
