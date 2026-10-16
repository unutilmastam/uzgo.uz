import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { SearchAll, SearchDish, SearchRestaurant } from '@uzgo/contracts';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { reindexFood } from './food-index.js';
import { normalizeSearchText, searchTokens } from './normalize.js';
import { SearchService } from './search.service.js';

type Names = { uz: string; ru: string };

/**
 * One query across the marketplace and UZGO Food (ADR 0026): products (the
 * existing full-text search), live restaurants and their available dishes
 * (trigram match on the normalised search text).
 */
@Injectable()
export class UnifiedSearchService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: SearchService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Rows created before the food search index existed get their text once. */
  async onApplicationBootstrap(): Promise<void> {
    if (this.env.NODE_ENV === 'test') return;
    await reindexFood(this.prisma);
  }

  private url(key: string | null) {
    return key ? { url: this.storage.publicUrl(key), alt: null } : null;
  }

  async searchFood(q: string, limit: { restaurants: number; dishes: number }) {
    const tokens = searchTokens(q);
    if (tokens.length === 0) return { restaurants: [], dishes: [] };
    const likes = tokens.map((t) => `%${t}%`);
    const whole = normalizeSearchText(q);
    const live = Prisma.sql`s."kind" = 'RESTAURANT' AND s."status" = 'ACTIVE' AND s."deletedAt" IS NULL`;
    const restaurantRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT s."id" FROM "RestaurantProfile" r JOIN "Store" s ON s."id" = r."storeId"
      WHERE ${live} AND r."searchText" LIKE ALL(${likes}::text[])
      ORDER BY similarity(r."searchText", ${whole}) DESC, s."id"
      LIMIT ${limit.restaurants}`;
    const dishRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT d."id" FROM "FoodMenuItem" d JOIN "Store" s ON s."id" = d."storeId"
      WHERE ${live} AND NOT d."archived" AND d."searchText" LIKE ALL(${likes}::text[])
      ORDER BY d."available" DESC, similarity(d."searchText", ${whole}) DESC, d."id"
      LIMIT ${limit.dishes}`;

    const stores = await this.prisma.store.findMany({
      where: { id: { in: restaurantRows.map((r) => r.id) } },
      select: {
        id: true,
        slug: true,
        name: true,
        restaurant: { select: { address: true, coverKey: true } },
      },
    });
    const storeById = new Map(stores.map((s) => [s.id, s]));
    const restaurants: SearchRestaurant[] = restaurantRows.flatMap((row) => {
      const s = storeById.get(row.id);
      return s
        ? [
            {
              id: s.id,
              slug: s.slug,
              name: s.name as Names,
              address: s.restaurant?.address ?? '',
              image: this.url(s.restaurant?.coverKey ?? null),
            },
          ]
        : [];
    });

    const items = await this.prisma.foodMenuItem.findMany({
      where: { id: { in: dishRows.map((r) => r.id) } },
      select: {
        id: true,
        name: true,
        priceTiyin: true,
        available: true,
        imageKey: true,
        store: { select: { slug: true, name: true } },
      },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));
    const dishes: SearchDish[] = dishRows.flatMap((row) => {
      const d = itemById.get(row.id);
      return d
        ? [
            {
              id: d.id,
              name: d.name as Names,
              priceTiyin: d.priceTiyin.toString(),
              available: d.available,
              image: this.url(d.imageKey),
              restaurant: { slug: d.store.slug, name: d.store.name as Names },
            },
          ]
        : [];
    });
    return { restaurants, dishes };
  }

  async searchAll(q: string): Promise<SearchAll> {
    const [products, food] = await Promise.all([
      this.products.search({ q, page: 1, pageSize: 8 }),
      this.searchFood(q, { restaurants: 6, dishes: 8 }),
    ]);
    return { products: products.items, productTotal: products.total, ...food };
  }
}
