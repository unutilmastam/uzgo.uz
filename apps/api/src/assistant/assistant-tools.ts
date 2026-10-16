import type { AssistantCard } from '@uzgo/contracts';
import { z } from 'zod';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ratingOf } from '../reviews/rating.js';
import type { SearchService } from '../search/search.service.js';
import type { UnifiedSearchService } from '../search/unified-search.service.js';
import { type Toolbox, type ToolDefinition, ToolInputError } from './assistant.provider.js';

type Names = { uz: string; ru: string };
type Locale = 'uz' | 'ru';

const som = (tiyin: string | bigint) => Number(BigInt(tiyin) / 100n);

const DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_products',
    description:
      'Search UZGO Market products (all sellers). Understands Uzbek (Latin or Cyrillic) and Russian. Returns up to 6 in-stock products with price in soʻm, store, rating and the path to link.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look for, e.g. "choynak" or "детская куртка"',
        },
        max_price_som: { type: 'integer', description: 'Optional upper price limit in soʻm' },
        sort: {
          type: 'string',
          enum: ['relevance', 'price_asc', 'price_desc', 'newest'],
          description: 'Optional order; relevance by default',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_food',
    description:
      'Search UZGO Food: restaurants and dishes by name. Returns restaurants and dishes (price in soʻm, whether available today) with the restaurant path to link.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A dish, cuisine or restaurant name' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_product',
    description:
      'Details of one product by its slug (from a search result path /p/<slug>): description, options with prices and stock, rating, store.',
    input_schema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
];

const searchProductsInput = z.object({
  query: z.string().trim().min(1).max(100),
  max_price_som: z.number().int().min(1).max(10_000_000_000).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest']).optional(),
});
const searchFoodInput = z.object({ query: z.string().trim().min(1).max(100) });
const getProductInput = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(120),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ToolInputError(`Invalid input: ${result.error.message}`);
  return result.data;
}

/**
 * Read-only tools over public catalogue data (no personal data). Every item a
 * tool returns is remembered by its path so the reply can show it as a card.
 */
export class CatalogToolbox implements Toolbox {
  readonly definitions = DEFINITIONS;
  /** path → card, for items the tools returned in this turn. */
  readonly known = new Map<string, AssistantCard>();

  constructor(
    private readonly deps: {
      prisma: PrismaService;
      products: SearchService;
      food: UnifiedSearchService;
    },
    private readonly locale: Locale,
  ) {}

  private name(names: Names) {
    return names[this.locale];
  }

  async run(name: string, input: unknown): Promise<string> {
    switch (name) {
      case 'search_products':
        return JSON.stringify(await this.searchProducts(parse(searchProductsInput, input)));
      case 'search_food':
        return JSON.stringify(await this.searchFood(parse(searchFoodInput, input)));
      case 'get_product':
        return JSON.stringify(await this.getProduct(parse(getProductInput, input)));
      default:
        throw new ToolInputError(`Unknown tool ${name}`);
    }
  }

  private async searchProducts(input: z.infer<typeof searchProductsInput>) {
    const list = await this.deps.products.search({
      q: input.query,
      page: 1,
      pageSize: 6,
      ...(input.max_price_som ? { maxPrice: input.max_price_som } : {}),
      ...(input.sort ? { sort: input.sort } : {}),
    });
    return {
      total: list.total,
      products: list.items.map((p) => {
        const path = `/p/${p.slug}`;
        this.known.set(path, {
          type: 'product',
          slug: p.slug,
          name: p.title,
          priceTiyin: p.priceTiyin,
          image: p.image,
        });
        return {
          name: this.name(p.title),
          price_som: som(p.priceTiyin),
          ...(p.compareAtPriceTiyin ? { old_price_som: som(p.compareAtPriceTiyin) } : {}),
          store: this.name(p.store.name),
          rating: p.rating ? { average: p.rating.average, reviews: p.rating.count } : null,
          path,
        };
      }),
    };
  }

  private async searchFood(input: z.infer<typeof searchFoodInput>) {
    const found = await this.deps.food.searchFood(input.query, { restaurants: 5, dishes: 8 });
    return {
      restaurants: found.restaurants.map((r) => {
        const path = `/food/${r.slug}`;
        this.known.set(path, { type: 'restaurant', slug: r.slug, name: r.name });
        return { name: this.name(r.name), address: r.address, path };
      }),
      dishes: found.dishes.map((d) => {
        const path = `/food/${d.restaurant.slug}`;
        if (!this.known.has(path)) {
          this.known.set(path, {
            type: 'dish',
            restaurantSlug: d.restaurant.slug,
            name: d.name,
            priceTiyin: d.priceTiyin,
          });
        }
        return {
          name: this.name(d.name),
          price_som: som(d.priceTiyin),
          available_today: d.available,
          restaurant: this.name(d.restaurant.name),
          path,
        };
      }),
    };
  }

  private async getProduct(input: z.infer<typeof getProductInput>) {
    const p = await this.deps.prisma.product.findFirst({
      where: {
        slug: input.slug,
        status: 'APPROVED',
        deletedAt: null,
        store: { status: 'ACTIVE', deletedAt: null },
      },
      select: {
        slug: true,
        title: true,
        description: true,
        ratingSum: true,
        ratingCount: true,
        store: { select: { name: true } },
        variants: {
          where: { active: true },
          orderBy: { priceTiyin: 'asc' },
          take: 20,
          select: {
            priceTiyin: true,
            stock: true,
            options: { select: { attributeValue: { select: { name: true } } } },
          },
        },
      },
    });
    if (!p) return { found: false };
    const rating = ratingOf(p.ratingSum, p.ratingCount);
    const description = p.description as Names | null;
    return {
      found: true,
      name: this.name(p.title as Names),
      description: description ? this.name(description).slice(0, 1500) : null,
      store: this.name(p.store.name as Names),
      rating: rating ? { average: rating.average, reviews: rating.count } : null,
      options: p.variants.map((v) => ({
        option: v.options.map((o) => this.name(o.attributeValue.name as Names)).join(', ') || null,
        price_som: som(v.priceTiyin),
        in_stock: v.stock > 0,
      })),
      path: `/p/${p.slug}`,
    };
  }
}
