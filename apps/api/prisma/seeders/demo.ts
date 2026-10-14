import { readFileSync } from 'node:fs';
import type { Db, Localized } from './types.js';

type DemoData = {
  brands: { code: string; name: Localized }[];
  stores: { slug: string; name: Localized; district: string }[];
  products: {
    slug: string;
    store: string;
    category: string;
    title: Localized;
    brand?: string;
    status: 'APPROVED' | 'PENDING_REVIEW';
    variants: { price: number; compareAt?: number; stock: number; options: string[] }[];
  }[];
};

const description = (title: Localized): Localized => ({
  uz: `${title.uz}. Bu demo mahsulot: nomi, doʻkoni va narxi namuna sifatida koʻrsatilgan.`,
  ru: `${title.ru}. Это демо-товар: название, магазин и цена показаны для примера.`,
});

/**
 * DEMO DATA ONLY (SPEC §16): fictional stores and products, labelled "Demo"
 * in the UI. Refuses to run in production.
 */
export async function seedDemo(prisma: Db): Promise<string> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo data must never be seeded in production');
  const data = JSON.parse(
    readFileSync(new URL('../data/demo.json', import.meta.url), 'utf8'),
  ) as DemoData;

  const valueId = new Map<string, string>();
  const attributes = await prisma.attribute.findMany({
    select: { id: true, code: true, values: true },
  });
  const brand = attributes.find((a) => a.code === 'brand');
  if (!brand) throw new Error('Run the catalog seed first');
  for (const [index, b] of data.brands.entries()) {
    await prisma.attributeValue.upsert({
      where: { attributeId_code: { attributeId: brand.id, code: b.code } },
      create: { attributeId: brand.id, code: b.code, name: b.name, sort: index },
      update: { name: b.name, sort: index },
    });
  }
  for (const attribute of await prisma.attribute.findMany({
    select: { code: true, values: true },
  })) {
    for (const value of attribute.values) valueId.set(`${attribute.code}:${value.code}`, value.id);
  }
  const lookup = (key: string): string => {
    const id = valueId.get(key);
    if (!id) throw new Error(`Unknown attribute value ${key}`);
    return id;
  };

  const storeIds = new Map<string, string>();
  for (const store of data.stores) {
    const district = await prisma.district.findUnique({
      where: { slug: store.district },
      select: { id: true },
    });
    const row = await prisma.store.upsert({
      where: { slug: store.slug },
      create: {
        slug: store.slug,
        name: store.name,
        status: 'ACTIVE',
        isDemo: true,
        districtId: district?.id ?? null,
      },
      update: {
        name: store.name,
        status: 'ACTIVE',
        isDemo: true,
        districtId: district?.id ?? null,
      },
      select: { id: true },
    });
    storeIds.set(store.slug, row.id);
  }

  for (const [productIndex, product] of data.products.entries()) {
    const storeId = storeIds.get(product.store);
    const category = await prisma.category.findUnique({
      where: { slug: product.category },
      select: { id: true },
    });
    if (!storeId || !category) throw new Error(`Bad demo product ${product.slug}`);
    const fields = {
      storeId,
      categoryId: category.id,
      title: product.title,
      description: description(product.title),
      status: product.status,
    };
    const row = await prisma.product.upsert({
      where: { slug: product.slug },
      create: { slug: product.slug, ...fields },
      update: fields,
      select: { id: true },
    });
    await prisma.productAttributeValue.deleteMany({ where: { productId: row.id } });
    if (product.brand) {
      await prisma.productAttributeValue.create({
        data: { productId: row.id, attributeValueId: lookup(`brand:${product.brand}`) },
      });
    }
    for (const [index, variant] of product.variants.entries()) {
      const sku = `DEMO-${String(productIndex + 1).padStart(3, '0')}-${String(index + 1)}`;
      const values = {
        productId: row.id,
        priceTiyin: BigInt(variant.price) * 100n,
        compareAtPriceTiyin:
          variant.compareAt === undefined ? null : BigInt(variant.compareAt) * 100n,
        stock: variant.stock,
        sort: index,
        active: true,
      };
      const v = await prisma.productVariant.upsert({
        where: { storeId_sku: { storeId, sku } },
        create: { storeId, sku, ...values },
        update: values,
        select: { id: true },
      });
      await prisma.variantAttributeValue.deleteMany({ where: { variantId: v.id } });
      for (const option of variant.options) {
        await prisma.variantAttributeValue.create({
          data: { variantId: v.id, attributeValueId: lookup(option) },
        });
      }
    }
  }
  return `demo stores: ${String(data.stores.length)}, demo products: ${String(data.products.length)}`;
}
