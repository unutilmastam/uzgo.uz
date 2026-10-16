import type { PrismaClient } from '../generated/prisma/client.js';
import { normalizeSearchText } from './normalize.js';

type Names = { uz?: string; ru?: string };
const both = (value: unknown): string => {
  const names = value as Names | null;
  return `${names?.uz ?? ''} ${names?.ru ?? ''}`;
};
const squash = (text: string) =>
  [...new Set(normalizeSearchText(text).split(' '))].join(' ').slice(0, 2000);

/**
 * Rebuilds the food search text (ADR 0026) for the given restaurants (store
 * ids) or for every row still empty: restaurant name + address, dish name +
 * description + category. Call after staff change a restaurant or a dish.
 */
export async function reindexFood(
  prisma: Pick<PrismaClient, 'restaurantProfile' | 'foodMenuItem'>,
  storeIds?: string[],
): Promise<number> {
  const restaurants = await prisma.restaurantProfile.findMany({
    where: storeIds ? { storeId: { in: storeIds } } : { searchText: '' },
    take: storeIds ? undefined : 500,
    select: { storeId: true, address: true, store: { select: { name: true } } },
  });
  for (const r of restaurants) {
    await prisma.restaurantProfile.update({
      where: { storeId: r.storeId },
      data: { searchText: squash(`${both(r.store.name)} ${r.address}`) },
    });
  }
  const items = await prisma.foodMenuItem.findMany({
    where: storeIds ? { storeId: { in: storeIds } } : { searchText: '' },
    take: storeIds ? undefined : 2000,
    select: { id: true, name: true, description: true, category: { select: { name: true } } },
  });
  for (const item of items) {
    await prisma.foodMenuItem.update({
      where: { id: item.id },
      data: {
        searchText: squash(
          `${both(item.name)} ${both(item.description)} ${both(item.category.name)}`,
        ),
      },
    });
  }
  return restaurants.length + items.length;
}
