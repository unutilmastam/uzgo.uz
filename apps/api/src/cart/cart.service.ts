import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type CartLine, type CartView, MAX_LINE_QUANTITY } from '@uzgo/contracts';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { AppException } from '../common/http-exception.filter.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';

type Names = { uz: string; ru: string };
export const MAX_CART_LINES = 50;

/** Who owns the cart for this request. */
export type CartOwner = { userId: string } | { guestToken: string | undefined };

const variantSelect = {
  id: true,
  priceTiyin: true,
  stock: true,
  active: true,
  options: {
    select: { attributeValue: { select: { name: true, attribute: { select: { sort: true } } } } },
  },
  product: {
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      deletedAt: true,
      category: { select: { active: true, icon: true, parent: { select: { icon: true } } } },
      store: {
        select: { id: true, slug: true, name: true, isDemo: true, status: true, deletedAt: true },
      },
      images: { orderBy: { sort: 'asc' }, take: 1, select: { storageKey: true } },
    },
  },
} satisfies Prisma.ProductVariantSelect;

type VariantRow = Prisma.ProductVariantGetPayload<{ select: typeof variantSelect }>;

export function isVariantSellable(v: VariantRow): boolean {
  const p = v.product;
  return (
    v.active &&
    p.status === 'APPROVED' &&
    p.deletedAt === null &&
    p.category.active &&
    p.store.status === 'ACTIVE' &&
    p.store.deletedAt === null
  );
}

@Injectable()
export class CartService {
  readonly cookieName: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {
    this.cookieName = env.NODE_ENV === 'production' ? '__Host-uzgo_cart' : 'uzgo_cart';
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    };
  }

  /** Finds the owner's cart; creates one when `create` is set. Returns a new guest token if one was issued. */
  async resolve(
    owner: CartOwner,
    create: boolean,
  ): Promise<{ cartId: string | null; newGuestToken?: string }> {
    if ('userId' in owner) {
      if (!create) {
        const cart = await this.prisma.cart.findUnique({
          where: { userId: owner.userId },
          select: { id: true },
        });
        return { cartId: cart?.id ?? null };
      }
      const cart = await this.prisma.cart.upsert({
        where: { userId: owner.userId },
        create: { userId: owner.userId },
        update: {},
        select: { id: true },
      });
      return { cartId: cart.id };
    }
    if (owner.guestToken && owner.guestToken.length >= 32 && owner.guestToken.length <= 128) {
      const cart = await this.prisma.cart.findUnique({
        where: { guestTokenHash: sha256(owner.guestToken) },
        select: { id: true, userId: true },
      });
      if (cart && cart.userId === null) return { cartId: cart.id };
    }
    if (!create) return { cartId: null };
    const token = randomToken();
    const cart = await this.prisma.cart.create({
      data: { guestTokenHash: sha256(token) },
      select: { id: true },
    });
    return { cartId: cart.id, newGuestToken: token };
  }

  private async variantFor(variantId: string): Promise<VariantRow> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: variantSelect,
    });
    if (!variant || !isVariantSellable(variant)) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_UNAVAILABLE',
        'This product is not available',
      );
    }
    return variant;
  }

  async addItem(cartId: string, variantId: string, quantity: number): Promise<void> {
    const variant = await this.variantFor(variantId);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId, variantId } },
      });
      const wanted = (existing?.quantity ?? 0) + quantity;
      if (wanted > Math.min(variant.stock, MAX_LINE_QUANTITY)) {
        throw new AppException(HttpStatus.CONFLICT, 'INSUFFICIENT_STOCK', 'Not enough stock', {
          available: Math.min(variant.stock, MAX_LINE_QUANTITY),
          inCart: existing?.quantity ?? 0,
        });
      }
      if (!existing && (await tx.cartItem.count({ where: { cartId } })) >= MAX_CART_LINES) {
        throw new AppException(HttpStatus.CONFLICT, 'CART_LIMIT', 'The cart is full');
      }
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        create: { cartId, variantId, quantity: wanted },
        update: { quantity: wanted },
      });
      await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    });
  }

  async setQuantity(cartId: string, variantId: string, quantity: number): Promise<void> {
    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
    });
    if (!item) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not in the cart');
    const variant = await this.variantFor(variantId);
    if (quantity > variant.stock) {
      throw new AppException(HttpStatus.CONFLICT, 'INSUFFICIENT_STOCK', 'Not enough stock', {
        available: Math.min(variant.stock, MAX_LINE_QUANTITY),
        inCart: item.quantity,
      });
    }
    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  }

  async removeItem(cartId: string, variantId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { cartId, variantId } });
  }

  /** Moves a guest cart into the user's cart (quantities added, capped) and deletes it. */
  async mergeGuestIntoUser(guestToken: string | undefined, userId: string): Promise<void> {
    if (!guestToken) return;
    const guest = await this.prisma.cart.findUnique({
      where: { guestTokenHash: sha256(guestToken) },
      select: { id: true, userId: true, items: { select: { variantId: true, quantity: true } } },
    });
    if (!guest || guest.userId !== null) return;
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
        select: { id: true },
      });
      for (const item of guest.items) {
        const existing = await tx.cartItem.findUnique({
          where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
        });
        const quantity = Math.min((existing?.quantity ?? 0) + item.quantity, MAX_LINE_QUANTITY);
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
          create: { cartId: cart.id, variantId: item.variantId, quantity },
          update: { quantity },
        });
      }
      await tx.cart.delete({ where: { id: guest.id } });
    });
  }

  /** Cart with current server prices and availability, grouped by store. */
  async view(cartId: string | null): Promise<CartView> {
    const items = cartId
      ? await this.prisma.cartItem.findMany({
          where: { cartId },
          orderBy: { createdAt: 'asc' },
          select: { quantity: true, variant: { select: variantSelect } },
        })
      : [];
    const groups = new Map<string, CartView['groups'][number] & { subtotal: bigint }>();
    let subtotal = 0n;
    let itemCount = 0;
    let hasIssues = false;

    for (const { quantity, variant } of items) {
      const p = variant.product;
      const sellable = isVariantSellable(variant) && variant.stock > 0;
      const status: CartLine['status'] = !sellable
        ? 'UNAVAILABLE'
        : quantity > variant.stock
          ? 'INSUFFICIENT_STOCK'
          : 'OK';
      const lineTotal = variant.priceTiyin * BigInt(quantity);
      const image = p.images[0];
      const line: CartLine = {
        variantId: variant.id,
        productSlug: p.slug,
        title: p.title as Names,
        options: variant.options
          .toSorted((a, b) => a.attributeValue.attribute.sort - b.attributeValue.attribute.sort)
          .map((o) => o.attributeValue.name as Names),
        categoryIcon: p.category.icon ?? p.category.parent?.icon ?? null,
        imageUrl: image ? this.storage.publicUrl(image.storageKey) : null,
        unitPriceTiyin: variant.priceTiyin.toString(),
        quantity,
        available: sellable ? Math.min(variant.stock, MAX_LINE_QUANTITY) : 0,
        lineTotalTiyin: lineTotal.toString(),
        status,
      };
      const group = groups.get(p.store.id) ?? {
        store: {
          id: p.store.id,
          slug: p.store.slug,
          name: p.store.name as Names,
          isDemo: p.store.isDemo,
        },
        lines: [],
        subtotalTiyin: '0',
        subtotal: 0n,
      };
      group.lines.push(line);
      if (status === 'OK') {
        group.subtotal += lineTotal;
        subtotal += lineTotal;
        itemCount += quantity;
      } else {
        hasIssues = true;
      }
      groups.set(p.store.id, group);
    }

    return {
      groups: [...groups.values()].map(({ subtotal: s, ...g }) => ({
        ...g,
        subtotalTiyin: s.toString(),
      })),
      itemCount,
      subtotalTiyin: subtotal.toString(),
      // Delivery pricing arrives with delivery zones (Phase 6).
      deliveryTiyin: '0',
      totalTiyin: subtotal.toString(),
      hasIssues,
    };
  }
}

/** Used by checkout (Phase 4f) to read cart lines with the same rules. */
export { variantSelect };
