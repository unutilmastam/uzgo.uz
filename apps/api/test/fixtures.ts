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
