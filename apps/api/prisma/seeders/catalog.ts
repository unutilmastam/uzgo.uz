import { readFileSync } from 'node:fs';
import type { Db, Localized } from './types.js';

type CategoryNode = {
  slug: string;
  name: Localized;
  icon?: string;
  attributes?: string[];
  children?: CategoryNode[];
};

type CatalogData = {
  attributes: { code: string; name: Localized; values: { code: string; name: Localized }[] }[];
  categories: CategoryNode[];
};

/** Reference catalog structure: category tree + filter attributes. Idempotent. */
export async function seedCatalog(prisma: Db): Promise<string> {
  const data = JSON.parse(
    readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'),
  ) as CatalogData;

  const attributeIds = new Map<string, string>();
  for (const [index, attribute] of data.attributes.entries()) {
    const row = await prisma.attribute.upsert({
      where: { code: attribute.code },
      create: { code: attribute.code, name: attribute.name, sort: index },
      update: { name: attribute.name, sort: index },
      select: { id: true },
    });
    attributeIds.set(attribute.code, row.id);
    for (const [valueIndex, value] of attribute.values.entries()) {
      await prisma.attributeValue.upsert({
        where: { attributeId_code: { attributeId: row.id, code: value.code } },
        create: { attributeId: row.id, code: value.code, name: value.name, sort: valueIndex },
        update: { name: value.name, sort: valueIndex },
      });
    }
  }

  let count = 0;
  async function upsertTree(nodes: CategoryNode[], parentId: string | null): Promise<void> {
    for (const [index, node] of nodes.entries()) {
      const row = await prisma.category.upsert({
        where: { slug: node.slug },
        create: {
          slug: node.slug,
          name: node.name,
          icon: node.icon ?? null,
          sort: index,
          parentId,
        },
        update: { name: node.name, icon: node.icon ?? null, sort: index, parentId },
        select: { id: true },
      });
      count++;
      await prisma.categoryAttribute.deleteMany({ where: { categoryId: row.id } });
      for (const [attrIndex, code] of (node.attributes ?? []).entries()) {
        const attributeId = attributeIds.get(code);
        if (!attributeId) throw new Error(`Unknown attribute ${code}`);
        await prisma.categoryAttribute.create({
          data: { categoryId: row.id, attributeId, sort: attrIndex },
        });
      }
      await upsertTree(node.children ?? [], row.id);
    }
  }
  await upsertTree(data.categories, null);
  return `categories: ${String(count)}, attributes: ${String(attributeIds.size)}`;
}
