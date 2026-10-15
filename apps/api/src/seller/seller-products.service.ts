import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type CreateProduct,
  type CreateVariant,
  PRODUCT_IMAGE_LIMITS,
  type ProductStatus,
  type SellerAttribute,
  type SellerProduct,
  type SellerProductList,
  type UpdateProduct,
  type UpdateVariant,
  createProductSchema,
  createVariantSchema,
} from '@uzgo/contracts';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/http-exception.filter.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reindexProducts } from '../search/search-index.js';
import { normalizeSearchText } from '../search/normalize.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { processProductImage } from './image-processing.js';

type Tx = Prisma.TransactionClient;
type Names = { uz: string; ru: string };
export type Meta = { ip: string; requestId?: string | undefined };
export type Actor = { userId: string; storeId: string; status: string };

const PAGE_SIZE = 20;

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Product not found');
const bad = (code: string, message: string) =>
  new AppException(HttpStatus.BAD_REQUEST, code, message);
const conflict = (code: string, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);

/** Content changes to an approved or rejected product need a new review. */
function afterContentEdit(status: ProductStatus): ProductStatus {
  if (status === 'APPROVED') return 'PENDING_REVIEW';
  if (status === 'REJECTED') return 'DRAFT';
  return status;
}

/** Latin, URL-safe slug from the Uzbek title plus a random suffix (never user-chosen). */
export function productSlug(title: string): string {
  const base = normalizeSearchText(title).trim().replace(/\s+/g, '-').slice(0, 60);
  const suffix = randomBytes(4).toString('hex');
  return base ? `${base.replace(/-+$/, '')}-${suffix}` : `product-${suffix}`;
}

const detailInclude = {
  variants: {
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    include: {
      options: {
        include: {
          attributeValue: {
            select: { id: true, name: true, attribute: { select: { code: true } } },
          },
        },
      },
    },
  },
  images: { orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] },
  attributes: { select: { attributeValueId: true } },
} satisfies Prisma.ProductInclude;

type DetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

/** Seller catalogue management. Every query is scoped by storeId (seller isolation). */
@Injectable()
export class SellerProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  private toDetail(row: DetailRow): SellerProduct {
    return {
      id: row.id,
      slug: row.slug,
      status: row.status,
      categoryId: row.categoryId,
      title: row.title as Names,
      description: row.description as Names,
      attributeValueIds: row.attributes.map((a) => a.attributeValueId),
      moderationNote: row.moderationNote,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      variants: row.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: v.barcode,
        priceTiyin: v.priceTiyin.toString(),
        compareAtPriceTiyin: v.compareAtPriceTiyin?.toString() ?? null,
        stock: v.stock,
        mxikCode: v.mxikCode,
        packageCode: v.packageCode,
        vatRateBp: v.vatRateBp,
        active: v.active,
        options: v.options.map((o) => ({
          id: o.attributeValue.id,
          attribute: o.attributeValue.attribute.code,
          name: o.attributeValue.name as Names,
        })),
      })),
      images: row.images.map((image) => ({
        id: image.id,
        url: this.storage.publicUrl(image.storageKey),
        width: image.width,
        height: image.height,
      })),
    };
  }

  private async load(storeId: string, productId: string, tx: Tx = this.prisma) {
    const row = await tx.product.findFirst({
      where: { id: productId, storeId, deletedAt: null },
      include: detailInclude,
    });
    if (!row) throw notFound();
    return row;
  }

  async get(storeId: string, productId: string): Promise<SellerProduct> {
    return this.toDetail(await this.load(storeId, productId));
  }

  /** Staff (moderation) view of any store's product. Callers must enforce staff roles. */
  async getForStaff(productId: string): Promise<SellerProduct & { storeId: string }> {
    const row = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: detailInclude,
    });
    if (!row) throw notFound();
    return { ...this.toDetail(row), storeId: row.storeId };
  }

  async list(
    storeId: string,
    status: ProductStatus | undefined,
    page: number,
  ): Promise<SellerProductList> {
    const where = {
      storeId,
      deletedAt: null,
      ...(status ? { status } : {}),
    } satisfies Prisma.ProductWhereInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          slug: true,
          status: true,
          title: true,
          moderationNote: true,
          updatedAt: true,
          images: { orderBy: { sort: 'asc' }, take: 1, select: { storageKey: true } },
          variants: { select: { priceTiyin: true, stock: true, active: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => {
        const active = row.variants.filter((v) => v.active);
        const min = active.reduce<bigint | null>(
          (acc, v) => (acc === null || v.priceTiyin < acc ? v.priceTiyin : acc),
          null,
        );
        const image = row.images[0];
        return {
          id: row.id,
          slug: row.slug,
          status: row.status,
          title: row.title as Names,
          image: image ? this.storage.publicUrl(image.storageKey) : null,
          minPriceTiyin: min?.toString() ?? null,
          totalStock: active.reduce((sum, v) => sum + v.stock, 0),
          variantCount: row.variants.length,
          moderationNote: row.moderationNote,
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Category must be active and a leaf; returns the attribute ids it allows (inherited). */
  private async categoryAttributes(categoryId: string, tx: Tx): Promise<Set<string>> {
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      select: { active: true, _count: { select: { children: true } } },
    });
    if (!category?.active || category._count.children > 0) {
      throw bad('INVALID_CATEGORY', 'Choose an active leaf category');
    }
    const allowed = new Set<string>();
    let current: string | null = categoryId;
    for (let depth = 0; current && depth < 10; depth += 1) {
      const node: { parentId: string | null; attributes: { attributeId: string }[] } | null =
        await tx.category.findUnique({
          where: { id: current },
          select: { parentId: true, attributes: { select: { attributeId: true } } },
        });
      if (!node) break;
      for (const a of node.attributes) allowed.add(a.attributeId);
      current = node.parentId;
    }
    return allowed;
  }

  /** Attributes (with value ids) a product in this leaf category can use. */
  async attributesFor(categoryId: string): Promise<SellerAttribute[]> {
    const allowed = await this.categoryAttributes(categoryId, this.prisma);
    const rows = await this.prisma.attribute.findMany({
      where: { id: { in: [...allowed] } },
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      include: { values: { orderBy: [{ sort: 'asc' }, { code: 'asc' }] } },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name as Names,
      values: row.values.map((v) => ({ id: v.id, code: v.code, name: v.name as Names })),
    }));
  }

  /** Values must exist, belong to allowed attributes, and be one per attribute. */
  private async checkValues(valueIds: string[], allowed: Set<string>, tx: Tx): Promise<void> {
    const unique = [...new Set(valueIds)];
    if (unique.length !== valueIds.length) throw bad('INVALID_ATTRIBUTES', 'Duplicate values');
    if (unique.length === 0) return;
    const values = await tx.attributeValue.findMany({
      where: { id: { in: unique } },
      select: { attributeId: true },
    });
    const attributes = values.map((v) => v.attributeId);
    if (
      values.length !== unique.length ||
      attributes.some((a) => !allowed.has(a)) ||
      new Set(attributes).size !== attributes.length
    ) {
      throw bad('INVALID_ATTRIBUTES', 'These attributes do not fit the category');
    }
  }

  async create(actor: Actor, input: CreateProduct, meta: Meta): Promise<SellerProduct> {
    const data = createProductSchema.parse(input);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.checkValues(
        data.attributeValueIds,
        await this.categoryAttributes(data.categoryId, tx),
        tx,
      );
      const product = await tx.product.create({
        data: {
          storeId: actor.storeId,
          categoryId: data.categoryId,
          slug: productSlug(data.title.uz),
          title: data.title,
          description: data.description,
          status: 'DRAFT',
          attributes: {
            create: data.attributeValueIds.map((attributeValueId) => ({ attributeValueId })),
          },
        },
        select: { id: true },
      });
      await reindexProducts(tx, [product.id]);
      await this.audit.record(
        {
          action: 'product.created',
          entityType: 'Product',
          entityId: product.id,
          actorId: actor.userId,
          ...meta,
        },
        tx,
      );
      return product.id;
    });
    return this.get(actor.storeId, id);
  }

  async update(
    actor: Actor,
    productId: string,
    input: UpdateProduct,
    meta: Meta,
  ): Promise<SellerProduct> {
    await this.prisma.$transaction(async (tx) => {
      const product = await this.load(actor.storeId, productId, tx);
      if (product.status === 'ARCHIVED')
        throw conflict('PRODUCT_ARCHIVED', 'Restore the product first');
      const categoryId = input.categoryId ?? product.categoryId;
      if (input.categoryId !== undefined || input.attributeValueIds !== undefined) {
        const allowed = await this.categoryAttributes(categoryId, tx);
        const valueIds =
          input.attributeValueIds ?? product.attributes.map((a) => a.attributeValueId);
        await this.checkValues(valueIds, allowed, tx);
        if (input.categoryId !== undefined && input.categoryId !== product.categoryId) {
          // Variant options must still fit the new category.
          for (const variant of product.variants) {
            const optionIds = variant.options.map((o) => o.attributeValue.id);
            await this.checkValues(optionIds, allowed, tx);
          }
        }
      }
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.attributeValueIds !== undefined
            ? {
                attributes: {
                  deleteMany: {},
                  create: input.attributeValueIds.map((attributeValueId) => ({ attributeValueId })),
                },
              }
            : {}),
          status: afterContentEdit(product.status),
        },
      });
      await reindexProducts(tx, [productId]);
      await this.audit.record(
        {
          action: 'product.updated',
          entityType: 'Product',
          entityId: productId,
          actorId: actor.userId,
          metadata: {
            fields: Object.keys(input),
            from: product.status,
            to: afterContentEdit(product.status),
          },
          ...meta,
        },
        tx,
      );
    });
    return this.get(actor.storeId, productId);
  }

  async addVariant(
    actor: Actor,
    productId: string,
    input: CreateVariant,
    meta: Meta,
  ): Promise<SellerProduct> {
    const data = createVariantSchema.parse(input);
    this.checkPrices(BigInt(data.priceTiyin), data.compareAtPriceTiyin);
    await this.prisma.$transaction(async (tx) => {
      const product = await this.load(actor.storeId, productId, tx);
      if (product.status === 'ARCHIVED')
        throw conflict('PRODUCT_ARCHIVED', 'Restore the product first');
      if (product.variants.length >= 50) throw conflict('VARIANT_LIMIT', 'Too many variants');
      await this.checkValues(
        data.optionValueIds,
        await this.categoryAttributes(product.categoryId, tx),
        tx,
      );
      const variant = await this.writeSku(() =>
        tx.productVariant.create({
          data: {
            productId,
            storeId: actor.storeId,
            sku: data.sku,
            barcode: data.barcode ?? null,
            priceTiyin: BigInt(data.priceTiyin),
            compareAtPriceTiyin: data.compareAtPriceTiyin ? BigInt(data.compareAtPriceTiyin) : null,
            stock: data.stock,
            mxikCode: data.mxikCode ?? null,
            packageCode: data.packageCode ?? null,
            vatRateBp: data.vatRateBp ?? null,
            sort: product.variants.length,
            options: {
              create: data.optionValueIds.map((attributeValueId) => ({ attributeValueId })),
            },
          },
          select: { id: true },
        }),
      );
      // A new option set is content: an approved product goes back to review.
      await tx.product.update({
        where: { id: productId },
        data: { status: afterContentEdit(product.status) },
      });
      await this.audit.record(
        {
          action: 'variant.created',
          entityType: 'ProductVariant',
          entityId: variant.id,
          actorId: actor.userId,
          ...meta,
        },
        tx,
      );
    });
    return this.get(actor.storeId, productId);
  }

  /**
   * Price, stock and availability changes apply immediately (no review).
   * `stockAdjust` is applied atomically in SQL and can never go below zero.
   */
  async updateVariant(
    actor: Actor,
    productId: string,
    variantId: string,
    input: UpdateVariant,
    meta: Meta,
  ): Promise<SellerProduct> {
    await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, productId, storeId: actor.storeId, product: { deletedAt: null } },
        select: { priceTiyin: true, compareAtPriceTiyin: true, stock: true },
      });
      if (!variant) throw notFound();
      const price = input.priceTiyin !== undefined ? BigInt(input.priceTiyin) : variant.priceTiyin;
      const compareAt =
        input.compareAtPriceTiyin !== undefined
          ? input.compareAtPriceTiyin
          : (variant.compareAtPriceTiyin?.toString() ?? null);
      this.checkPrices(price, compareAt);

      if (input.stockAdjust !== undefined) {
        const changed = await tx.productVariant.updateMany({
          where: { id: variantId, stock: { gte: -input.stockAdjust } },
          data: { stock: { increment: input.stockAdjust } },
        });
        if (changed.count === 0) throw conflict('STOCK_NEGATIVE', 'Stock cannot go below zero');
      }
      await this.writeSku(() =>
        tx.productVariant.update({
          where: { id: variantId },
          data: {
            ...(input.sku !== undefined ? { sku: input.sku } : {}),
            ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
            ...(input.priceTiyin !== undefined ? { priceTiyin: price } : {}),
            ...(input.compareAtPriceTiyin !== undefined
              ? { compareAtPriceTiyin: compareAt === null ? null : BigInt(compareAt) }
              : {}),
            ...(input.stock !== undefined ? { stock: input.stock } : {}),
            ...(input.mxikCode !== undefined ? { mxikCode: input.mxikCode } : {}),
            ...(input.packageCode !== undefined ? { packageCode: input.packageCode } : {}),
            ...(input.vatRateBp !== undefined ? { vatRateBp: input.vatRateBp } : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
          },
        }),
      );
      await this.audit.record(
        {
          action: 'variant.updated',
          entityType: 'ProductVariant',
          entityId: variantId,
          actorId: actor.userId,
          metadata: {
            fields: Object.keys(input),
            ...(input.priceTiyin !== undefined
              ? { priceFrom: variant.priceTiyin.toString(), priceTo: input.priceTiyin }
              : {}),
          },
          ...meta,
        },
        tx,
      );
    });
    return this.get(actor.storeId, productId);
  }

  private checkPrices(price: bigint, compareAt: string | null | undefined): void {
    if (compareAt !== null && compareAt !== undefined && BigInt(compareAt) <= price) {
      throw bad('INVALID_PRICE', 'The old price must be higher than the price');
    }
  }

  private async writeSku<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('SKU_TAKEN', 'This SKU is already used in the store');
      }
      throw err;
    }
  }

  /** DRAFT/REJECTED → PENDING_REVIEW. Needs an active store, an image and an active variant. */
  async submit(actor: Actor, productId: string, meta: Meta): Promise<SellerProduct> {
    if (actor.status !== 'ACTIVE') {
      throw conflict(
        'STORE_NOT_APPROVED',
        'The store must be approved before products are submitted',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const product = await this.load(actor.storeId, productId, tx);
      if (product.images.length === 0) throw conflict('IMAGE_REQUIRED', 'Add at least one image');
      if (!product.variants.some((v) => v.active)) {
        throw conflict('VARIANT_REQUIRED', 'Add at least one active variant');
      }
      const updated = await tx.product.updateMany({
        where: { id: productId, status: { in: ['DRAFT', 'REJECTED'] } },
        data: { status: 'PENDING_REVIEW', submittedAt: new Date(), moderationNote: null },
      });
      if (updated.count === 0) {
        throw conflict('INVALID_TRANSITION', `Cannot submit a product in status ${product.status}`);
      }
      await this.audit.record(
        {
          action: 'product.submitted',
          entityType: 'Product',
          entityId: productId,
          actorId: actor.userId,
          ...meta,
        },
        tx,
      );
    });
    return this.get(actor.storeId, productId);
  }

  /** Hides a product from the storefront (any status), or restores it as a draft. */
  async setArchived(
    actor: Actor,
    productId: string,
    archived: boolean,
    meta: Meta,
  ): Promise<SellerProduct> {
    await this.prisma.$transaction(async (tx) => {
      const product = await this.load(actor.storeId, productId, tx);
      if (archived === (product.status === 'ARCHIVED')) {
        throw conflict('INVALID_TRANSITION', archived ? 'Already archived' : 'Not archived');
      }
      await tx.product.update({
        where: { id: productId },
        data: { status: archived ? 'ARCHIVED' : 'DRAFT' },
      });
      await this.audit.record(
        {
          action: archived ? 'product.archived' : 'product.restored',
          entityType: 'Product',
          entityId: productId,
          actorId: actor.userId,
          ...meta,
        },
        tx,
      );
    });
    return this.get(actor.storeId, productId);
  }

  async addImage(
    actor: Actor,
    productId: string,
    file: Buffer,
    meta: Meta,
  ): Promise<SellerProduct> {
    if (file.length > PRODUCT_IMAGE_LIMITS.maxBytes)
      throw bad('FILE_TOO_LARGE', 'The file is too large');
    const product = await this.load(actor.storeId, productId);
    if (product.status === 'ARCHIVED')
      throw conflict('PRODUCT_ARCHIVED', 'Restore the product first');
    if (product.images.length >= PRODUCT_IMAGE_LIMITS.maxImages) {
      throw conflict('IMAGE_LIMIT', 'Too many images');
    }
    const image = await processProductImage(file);
    if (!image) throw bad('INVALID_IMAGE', 'Upload a JPEG, PNG, WebP or AVIF image');

    const key = `products/${productId.replaceAll('-', '')}/${randomBytes(12).toString('hex')}.webp`;
    await this.storage.put(key, image.body, 'image/webp');
    try {
      await this.prisma.$transaction(async (tx) => {
        const count = await tx.productImage.count({ where: { productId } });
        if (count >= PRODUCT_IMAGE_LIMITS.maxImages)
          throw conflict('IMAGE_LIMIT', 'Too many images');
        const row = await tx.productImage.create({
          data: {
            productId,
            storageKey: key,
            sort: count,
            width: image.width,
            height: image.height,
          },
          select: { id: true },
        });
        const current = await tx.product.findUniqueOrThrow({
          where: { id: productId },
          select: { status: true },
        });
        await tx.product.update({
          where: { id: productId },
          data: { status: afterContentEdit(current.status) },
        });
        await this.audit.record(
          {
            action: 'product.image_added',
            entityType: 'Product',
            entityId: productId,
            actorId: actor.userId,
            metadata: { imageId: row.id },
            ...meta,
          },
          tx,
        );
      });
    } catch (err) {
      await this.storage.delete(key);
      throw err;
    }
    return this.get(actor.storeId, productId);
  }

  async removeImage(
    actor: Actor,
    productId: string,
    imageId: string,
    meta: Meta,
  ): Promise<SellerProduct> {
    const key = await this.prisma.$transaction(async (tx) => {
      const product = await this.load(actor.storeId, productId, tx);
      const image = product.images.find((i) => i.id === imageId);
      if (!image) throw notFound();
      await tx.productImage.delete({ where: { id: imageId } });
      // An approved product must keep at least one image.
      if (product.status === 'APPROVED' && product.images.length === 1) {
        throw conflict('IMAGE_REQUIRED', 'A published product needs at least one image');
      }
      await this.audit.record(
        {
          action: 'product.image_removed',
          entityType: 'Product',
          entityId: productId,
          actorId: actor.userId,
          metadata: { imageId },
          ...meta,
        },
        tx,
      );
      return image.storageKey;
    });
    await this.storage.delete(key);
    return this.get(actor.storeId, productId);
  }

  async reorderImages(actor: Actor, productId: string, ids: string[]): Promise<SellerProduct> {
    await this.prisma.$transaction(async (tx) => {
      const product = await this.load(actor.storeId, productId, tx);
      const current = product.images.map((i) => i.id).sort();
      if (current.length !== ids.length || [...ids].sort().some((id, i) => id !== current[i])) {
        throw bad('VALIDATION_FAILED', 'Send every image id exactly once');
      }
      for (const [sort, id] of ids.entries()) {
        await tx.productImage.update({ where: { id }, data: { sort } });
      }
    });
    return this.get(actor.storeId, productId);
  }
}
