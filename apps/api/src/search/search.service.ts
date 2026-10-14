import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ProductList, ProductSearchQuery, ProductSummary } from '@uzgo/contracts';
import { CatalogService } from '../catalog/catalog.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { searchTokens } from './normalize.js';

type Names = { uz: string; ru: string };
type Row = { id: string; price: bigint; rank: number; total: bigint };

/**
 * Storefront product search and listings: PostgreSQL full-text (prefix) plus
 * trigram substring matching over the normalised searchText, with filters,
 * sorting and page-based pagination. All values are bound parameters.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async search(query: ProductSearchQuery): Promise<ProductList> {
    const where: Prisma.Sql[] = [
      Prisma.sql`p."status" = 'APPROVED'`,
      Prisma.sql`p."deletedAt" IS NULL`,
    ];

    if (query.category) {
      const category = await this.prisma.category.findFirst({
        where: { slug: query.category, active: true },
        select: { id: true },
      });
      if (!category)
        throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Category not found');
      const ids = await this.catalog.subtreeIds(category.id);
      where.push(Prisma.sql`p."categoryId" = ANY(${ids}::uuid[])`);
    }
    if (query.store) where.push(Prisma.sql`s."slug" = ${query.store}`);

    const tokens = searchTokens(query.q ?? '');
    let rank = Prisma.sql`0::float4`;
    if (tokens.length > 0) {
      const tsquery = tokens.map((t) => `${t}:*`).join(' & ');
      const likes = tokens.map((t) => `%${t}%`);
      where.push(
        Prisma.sql`(p."searchVector" @@ to_tsquery('simple', ${tsquery}) OR p."searchText" LIKE ALL(${likes}::text[]))`,
      );
      rank = Prisma.sql`ts_rank(p."searchVector", to_tsquery('simple', ${tsquery}))`;
    }

    // attr=code:value → OR within an attribute, AND across attributes;
    // a product matches through its own values or an in-stock variant's options.
    const groups = Map.groupBy(query.attr ?? [], (pair) => pair.split(':')[0] ?? '');
    for (const [code, pairs] of groups) {
      const values = pairs.map((pair) => pair.split(':')[1] ?? '');
      where.push(Prisma.sql`(
        EXISTS (SELECT 1 FROM "ProductAttributeValue" pav
                JOIN "AttributeValue" av ON av."id" = pav."attributeValueId"
                JOIN "Attribute" a ON a."id" = av."attributeId"
                WHERE pav."productId" = p."id" AND a."code" = ${code} AND av."code" = ANY(${values}::text[]))
        OR EXISTS (SELECT 1 FROM "ProductVariant" vv
                JOIN "VariantAttributeValue" vav ON vav."variantId" = vv."id"
                JOIN "AttributeValue" av ON av."id" = vav."attributeValueId"
                JOIN "Attribute" a ON a."id" = av."attributeId"
                WHERE vv."productId" = p."id" AND vv."active" AND vv."stock" > 0
                  AND a."code" = ${code} AND av."code" = ANY(${values}::text[]))
      )`);
    }

    const having: Prisma.Sql[] = [];
    if (query.minPrice !== undefined)
      having.push(Prisma.sql`MIN(v."priceTiyin") >= ${BigInt(query.minPrice) * 100n}`);
    if (query.maxPrice !== undefined)
      having.push(Prisma.sql`MIN(v."priceTiyin") <= ${BigInt(query.maxPrice) * 100n}`);

    const sort = query.sort ?? (tokens.length > 0 ? 'relevance' : 'newest');
    const orderBy = {
      relevance: Prisma.sql`rank DESC, p."createdAt" DESC`,
      newest: Prisma.sql`p."createdAt" DESC`,
      price_asc: Prisma.sql`price ASC, p."createdAt" DESC`,
      price_desc: Prisma.sql`price DESC, p."createdAt" DESC`,
    }[sort];

    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT p."id", MIN(v."priceTiyin") AS price, ${rank} AS rank, COUNT(*) OVER() AS total
      FROM "Product" p
      JOIN "Store" s ON s."id" = p."storeId" AND s."status" = 'ACTIVE' AND s."deletedAt" IS NULL
      JOIN "Category" c ON c."id" = p."categoryId" AND c."active"
      JOIN "ProductVariant" v ON v."productId" = p."id" AND v."active" AND v."stock" > 0
      WHERE ${Prisma.join(where, ' AND ')}
      GROUP BY p."id"
      ${having.length > 0 ? Prisma.sql`HAVING ${Prisma.join(having, ' AND ')}` : Prisma.empty}
      ORDER BY ${orderBy}, p."id"
      LIMIT ${query.pageSize} OFFSET ${offset}`;

    return {
      items: await this.summaries(rows.map((r) => r.id)),
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length > 0 ? Number(rows[0]?.total ?? 0) : 0,
    };
  }

  /** Product cards in the given order; price = cheapest in-stock variant. */
  async summaries(ids: string[]): Promise<ProductSummary[]> {
    if (ids.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        slug: true,
        title: true,
        category: { select: { slug: true, icon: true, parent: { select: { icon: true } } } },
        store: { select: { id: true, slug: true, name: true, isDemo: true } },
        images: { orderBy: { sort: 'asc' }, take: 1, select: { storageKey: true, alt: true } },
        variants: {
          where: { active: true, stock: { gt: 0 } },
          orderBy: { priceTiyin: 'asc' },
          take: 1,
          select: { priceTiyin: true, compareAtPriceTiyin: true },
        },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.flatMap((id) => {
      const p = byId.get(id);
      const variant = p?.variants[0];
      if (!p || !variant) return [];
      const image = p.images[0];
      return [
        {
          id: p.id,
          slug: p.slug,
          title: p.title as Names,
          categorySlug: p.category.slug,
          categoryIcon: p.category.icon ?? p.category.parent?.icon ?? null,
          store: { ...p.store, name: p.store.name as Names },
          priceTiyin: variant.priceTiyin.toString(),
          compareAtPriceTiyin: variant.compareAtPriceTiyin?.toString() ?? null,
          image: image
            ? {
                url: this.storage.publicUrl(image.storageKey),
                alt: (image.alt as Names | null) ?? null,
              }
            : null,
        },
      ];
    });
  }
}
