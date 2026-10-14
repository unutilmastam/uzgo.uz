import type { PrismaClient } from '../generated/prisma/client.js';
import { normalizeSearchText } from './normalize.js';

type Names = { uz?: string; ru?: string };
const both = (value: unknown): string => {
  const names = value as Names | null;
  return `${names?.uz ?? ''} ${names?.ru ?? ''}`;
};

/**
 * Rebuilds Product.searchText from titles, category path, brand/attributes and
 * store name (uz + ru). Call after any change to those fields. Usable from
 * the API and from scripts/seeds.
 */
export async function reindexProducts(
  prisma: Pick<PrismaClient, 'product' | 'category'>,
  productIds?: string[],
): Promise<number> {
  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true, name: true },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const categoryText = (id: string): string => {
    const parts: string[] = [];
    let current = byId.get(id);
    while (current) {
      parts.push(both(current.name));
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.join(' ');
  };

  const products = await prisma.product.findMany({
    where: productIds ? { id: { in: productIds } } : {},
    select: {
      id: true,
      title: true,
      categoryId: true,
      store: { select: { name: true } },
      attributes: { select: { attributeValue: { select: { name: true } } } },
      variants: {
        select: { sku: true, options: { select: { attributeValue: { select: { name: true } } } } },
      },
    },
  });
  for (const product of products) {
    const text = [
      both(product.title),
      categoryText(product.categoryId),
      both(product.store.name),
      ...product.attributes.map((a) => both(a.attributeValue.name)),
      ...product.variants.flatMap((v) => [
        v.sku,
        ...v.options.map((o) => both(o.attributeValue.name)),
      ]),
    ].join(' ');
    const normalized = [...new Set(normalizeSearchText(text).split(' '))].join(' ').slice(0, 4000);
    await prisma.product.update({ where: { id: product.id }, data: { searchText: normalized } });
  }
  return products.length;
}
