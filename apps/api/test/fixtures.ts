import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { reindexProducts } from '../src/search/search-index.js';

const suffix = () => randomUUID().slice(0, 8);

export async function createStore(
  prisma: PrismaService,
  data: { status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; ownerId?: string } = {},
) {
  const slug = `test-store-${suffix()}`;
  return prisma.store.create({
    data: {
      slug,
      name: { uz: `Test doʻkon ${slug}`, ru: `Тест магазин ${slug}` },
      status: data.status ?? 'ACTIVE',
      ...(data.ownerId ? { members: { create: { userId: data.ownerId, role: 'OWNER' } } } : {}),
    },
  });
}

export async function createProduct(
  prisma: PrismaService,
  data: {
    storeId: string;
    categorySlug?: string;
    title?: { uz: string; ru: string };
    status?: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
    variants?: { priceTiyin: bigint; stock: number; compareAtPriceTiyin?: bigint }[];
  },
) {
  const category = await prisma.category.findUniqueOrThrow({
    where: { slug: data.categorySlug ?? 'smartphones' },
  });
  const slug = `test-product-${suffix()}`;
  const product = await prisma.product.create({
    data: {
      slug,
      storeId: data.storeId,
      categoryId: category.id,
      title: data.title ?? { uz: `Test mahsulot ${slug}`, ru: `Тест товар ${slug}` },
      description: { uz: 'Tavsif', ru: 'Описание' },
      status: data.status ?? 'APPROVED',
      variants: {
        create: (data.variants ?? [{ priceTiyin: 100_000_00n, stock: 10 }]).map((v, index) => ({
          storeId: data.storeId,
          sku: `T-${suffix()}-${String(index)}`,
          priceTiyin: v.priceTiyin,
          compareAtPriceTiyin: v.compareAtPriceTiyin ?? null,
          stock: v.stock,
        })),
      },
    },
    include: { variants: true },
  });
  await reindexProducts(prisma, [product.id]);
  return product;
}

/**
 * Hides stores created by tests so they never show up on the storefront of
 * the shared development/CI database (call in afterAll).
 */
export async function retireTestStores(prisma: PrismaService): Promise<void> {
  await prisma.store.updateMany({
    where: { slug: { startsWith: 'test-store-' }, status: { not: 'SUSPENDED' } },
    data: { status: 'SUSPENDED' },
  });
}

/** Termiz centre; the fake geocoder's streets are within ~1 km. */
export const TERMIZ = { lat: 37.2242, lng: 67.2783 };
export const ALWAYS_OPEN = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day,
  open: '00:00',
  close: '00:00',
}));

/** A restaurant (open all week) with one menu category and the given dishes. */
export async function createRestaurant(
  prisma: PrismaService,
  data: {
    ownerId?: string;
    deliveryMode?: 'SELF' | 'UZGO';
    selfDeliveryFeeTiyin?: bigint;
    minOrderTiyin?: bigint;
    deliveryRadiusM?: number;
    openingHours?: { day: number; open: string; close: string }[];
    dishes?: { priceTiyin: bigint; available?: boolean; fiscal?: boolean }[];
  } = {},
) {
  const slug = `test-store-food-${suffix()}`;
  const district = await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } });
  const store = await prisma.store.create({
    data: {
      kind: 'RESTAURANT',
      districtId: district.id,
      slug,
      name: { uz: `Oshxona ${slug}`, ru: `Кафе ${slug}` },
      status: 'ACTIVE',
      taxId: '301234567',
      ...(data.ownerId ? { members: { create: { userId: data.ownerId, role: 'OWNER' } } } : {}),
      restaurant: {
        create: {
          address: 'Termiz, Alpomish koʻchasi 1',
          lat: TERMIZ.lat,
          lng: TERMIZ.lng,
          deliveryMode: data.deliveryMode ?? 'SELF',
          deliveryRadiusM: data.deliveryRadiusM ?? 5000,
          selfDeliveryFeeTiyin: data.selfDeliveryFeeTiyin ?? 0n,
          minOrderTiyin: data.minOrderTiyin ?? 0n,
          prepMinutes: 20,
          openingHours: data.openingHours ?? ALWAYS_OPEN,
        },
      },
      menuCategories: { create: { name: { uz: 'Asosiy', ru: 'Основные' } } },
    },
    include: { menuCategories: true },
  });
  const categoryId = store.menuCategories[0]?.id ?? '';
  const dishes = [];
  for (const [index, dish] of (data.dishes ?? [{ priceTiyin: 30_000_00n }]).entries()) {
    dishes.push(
      await prisma.foodMenuItem.create({
        data: {
          storeId: store.id,
          categoryId,
          name: { uz: `Taom ${String(index + 1)}`, ru: `Блюдо ${String(index + 1)}` },
          priceTiyin: dish.priceTiyin,
          available: dish.available ?? true,
          sort: index,
          ...(dish.fiscal === false
            ? {}
            : { mxikCode: '10202001001000000', packageCode: '1500567', vatRateBp: 1200 }),
        },
      }),
    );
  }
  return { store, dishes };
}
