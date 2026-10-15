import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CheckoutInput,
  OrderView,
  SellerOrderStatus as ContractSellerOrderStatus,
} from '@uzgo/contracts';
import { isVariantSellable, variantSelect } from '../cart/cart.service.js';
import { sha256 } from '../common/crypto.js';
import { AppException } from '../common/http-exception.filter.js';
import { normalizePhone } from '../auth/phone.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OrderActor, OrderStatus, SellerOrderStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  canTransition,
  deriveOrderStatus,
  RESTOCK_STATUSES,
  SELLER_ORDER_TRANSITIONS,
} from './state-machine.js';

type Names = { uz: string; ru: string };
type Tx = Prisma.TransactionClient;

const orderInclude = {
  district: { select: { name: true, region: { select: { name: true } } } },
  sellerOrders: {
    orderBy: { number: 'asc' },
    include: {
      store: { select: { id: true, slug: true, name: true, isDemo: true } },
      items: { orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Stable JSON (sorted keys) so equal requests hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Order year in Uzbekistan time. */
function tashkentYear(date: Date): string {
  return new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Tashkent' }).format(date);
}

export function allowedFor(
  status: SellerOrderStatus,
  actor: OrderActor,
): ContractSellerOrderStatus[] {
  return SELLER_ORDER_TRANSITIONS[status].filter((t) => t.actors.includes(actor)).map((t) => t.to);
}

export function toOrderView(order: OrderRow, actor: OrderActor): OrderView {
  return {
    number: order.number,
    status: order.status,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt.toISOString(),
    itemsTotalTiyin: order.itemsTotalTiyin.toString(),
    deliveryTotalTiyin: order.deliveryTotalTiyin.toString(),
    totalTiyin: order.totalTiyin.toString(),
    address: {
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      region: order.district.region.name as Names,
      district: order.district.name as Names,
      line: order.addressLine,
      comment: order.comment,
    },
    sellerOrders: order.sellerOrders.map((so) => ({
      id: so.id,
      number: so.number,
      status: so.status,
      store: { ...so.store, name: so.store.name as Names },
      items: so.items.map((item) => ({
        productSlug: item.productSlug,
        title: item.title as Names,
        options: item.options as Names[],
        sku: item.sku,
        unitPriceTiyin: item.unitPriceTiyin.toString(),
        quantity: item.quantity,
        lineTotalTiyin: item.lineTotalTiyin.toString(),
      })),
      itemsTotalTiyin: so.itemsTotalTiyin.toString(),
      deliveryTiyin: so.deliveryTiyin.toString(),
      totalTiyin: so.totalTiyin.toString(),
      allowedTransitions: allowedFor(so.status, actor),
    })),
  };
}

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cash-on-delivery checkout of the user's whole cart, in one transaction:
   * idempotency key → server-side totals → conditional stock decrements →
   * Order + one SellerOrder per store + item snapshots + events → cart cleared.
   */
  async checkout(userId: string, input: CheckoutInput, idempotencyKey: string): Promise<OrderView> {
    const requestHash = sha256(canonical(input));
    return this.prisma.$transaction(
      async (tx) => {
        // Concurrent requests with the same key wait here for the first one to finish.
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "IdempotencyKey" ("id", "userId", "scope", "key", "requestHash", "response")
          VALUES (gen_random_uuid(), ${userId}::uuid, 'checkout', ${idempotencyKey}, ${requestHash}, '{}'::jsonb)
          ON CONFLICT ("userId", "scope", "key") DO NOTHING
          RETURNING "id"`;
        const keyRow = inserted[0];
        if (!keyRow) {
          const existing = await tx.idempotencyKey.findUniqueOrThrow({
            where: { userId_scope_key: { userId, scope: 'checkout', key: idempotencyKey } },
          });
          if (existing.requestHash !== requestHash) {
            throw new AppException(
              HttpStatus.CONFLICT,
              'IDEMPOTENCY_KEY_REUSED',
              'This Idempotency-Key was used for a different request',
            );
          }
          return existing.response as unknown as OrderView;
        }

        const cart = await tx.cart.findUnique({
          where: { userId },
          select: {
            id: true,
            items: {
              orderBy: { variantId: 'asc' },
              select: { quantity: true, variant: { select: variantSelect } },
            },
          },
        });
        const lines = cart?.items ?? [];
        if (!cart || lines.length === 0) {
          throw new AppException(HttpStatus.BAD_REQUEST, 'CART_EMPTY', 'The cart is empty');
        }
        if (lines.some((l) => !isVariantSellable(l.variant) || l.quantity > l.variant.stock)) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'CART_HAS_ISSUES',
            'Some cart items are unavailable',
          );
        }

        const district = await tx.district.findFirst({
          where: { id: input.districtId, active: true },
          select: { id: true, name: true, region: { select: { name: true } } },
        });
        if (!district) {
          throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown district', [
            { path: 'districtId', message: 'Unknown district' },
          ]);
        }
        const phone = normalizePhone(input.recipientPhone);
        if (!phone)
          throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Invalid phone number');

        // Totals are computed here from current prices only.
        const byStore = Map.groupBy(lines, (l) => l.variant.product.store.id);
        let itemsTotal = 0n;
        for (const l of lines) itemsTotal += l.variant.priceTiyin * BigInt(l.quantity);
        const deliveryTotal = 0n; // delivery pricing arrives in Phase 6
        const total = itemsTotal + deliveryTotal;
        if (total.toString() !== input.expectedTotalTiyin) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'PRICE_CHANGED',
            'Prices have changed',
            {
              totalTiyin: total.toString(),
            },
          );
        }

        // Stock: conditional decrement in a fixed order (by variant id) — never below zero.
        for (const l of lines) {
          const updated = await tx.$executeRaw`
            UPDATE "ProductVariant" SET "stock" = "stock" - ${l.quantity}, "updatedAt" = now()
            WHERE "id" = ${l.variant.id}::uuid AND "active" AND "stock" >= ${l.quantity}`;
          if (updated === 0) {
            throw new AppException(HttpStatus.CONFLICT, 'OUT_OF_STOCK', 'Not enough stock', {
              variantId: l.variant.id,
            });
          }
        }

        const [{ seq }] = await tx.$queryRaw<
          [{ seq: bigint }]
        >`SELECT nextval('order_number_seq') AS seq`;
        const number = `UZ-${tashkentYear(new Date())}-${seq.toString().padStart(6, '0')}`;

        const order = await tx.order.create({
          data: {
            number,
            userId,
            paymentMethod: input.paymentMethod,
            itemsTotalTiyin: itemsTotal,
            deliveryTotalTiyin: deliveryTotal,
            totalTiyin: total,
            recipientName: input.recipientName,
            recipientPhone: phone,
            districtId: district.id,
            addressLine: input.addressLine,
            addressSnapshot: {
              district: district.name as Names,
              region: district.region.name as Names,
            },
            comment: input.comment ?? null,
            sellerOrders: {
              create: [...byStore.values()].map((storeLines, index) => {
                const subtotal = storeLines.reduce(
                  (sum, l) => sum + l.variant.priceTiyin * BigInt(l.quantity),
                  0n,
                );
                return {
                  number: `${number}-${String(index + 1)}`,
                  storeId: storeLines[0]?.variant.product.store.id ?? '',
                  itemsTotalTiyin: subtotal,
                  deliveryTiyin: 0n,
                  totalTiyin: subtotal,
                  items: {
                    create: storeLines.map((l) => ({
                      variantId: l.variant.id,
                      productId: l.variant.product.id,
                      productSlug: l.variant.product.slug,
                      title: l.variant.product.title as Names,
                      options: l.variant.options
                        .toSorted(
                          (a, b) =>
                            a.attributeValue.attribute.sort - b.attributeValue.attribute.sort,
                        )
                        .map((o) => o.attributeValue.name as Names),
                      sku: l.variant.sku,
                      unitPriceTiyin: l.variant.priceTiyin,
                      quantity: l.quantity,
                      lineTotalTiyin: l.variant.priceTiyin * BigInt(l.quantity),
                      mxikCode: l.variant.mxikCode,
                      packageCode: l.variant.packageCode,
                      vatRateBp: l.variant.vatRateBp,
                    })),
                  },
                };
              }),
            },
          },
          include: orderInclude,
        });

        await tx.orderEvent.createMany({
          data: [
            { orderId: order.id, actorId: userId, actorType: 'CUSTOMER', toStatus: 'CREATED' },
            ...order.sellerOrders.map((so) => ({
              orderId: order.id,
              sellerOrderId: so.id,
              actorId: userId,
              actorType: 'CUSTOMER' as const,
              toStatus: 'NEW',
            })),
          ],
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        const view = toOrderView(order, 'CUSTOMER');
        await tx.idempotencyKey.update({
          where: { id: keyRow.id },
          data: { response: view },
        });
        return view;
      },
      { timeout: 20_000 },
    );
  }

  async listForCustomer(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        number: true,
        status: true,
        createdAt: true,
        totalTiyin: true,
        sellerOrders: { select: { items: { select: { quantity: true } } } },
      },
    });
    return orders.map((o) => ({
      number: o.number,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      totalTiyin: o.totalTiyin.toString(),
      itemCount: o.sellerOrders.flatMap((so) => so.items).reduce((sum, i) => sum + i.quantity, 0),
      storeCount: o.sellerOrders.length,
    }));
  }

  /** Customers only ever see their own orders (others: 404, no existence leak). */
  async getForCustomer(userId: string, number: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { number, userId },
      include: orderInclude,
    });
    if (!order) throw notFound();
    return toOrderView(order, 'CUSTOMER');
  }

  /** Staff view of any order. Callers must enforce staff roles and the second factor. */
  async getForAdmin(number: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({ where: { number }, include: orderInclude });
    if (!order) throw notFound();
    return toOrderView(order, 'ADMIN');
  }

  async listForAdmin(
    filter: { status: OrderStatus | undefined; number: string | undefined },
    page: number,
    pageSize: number,
  ) {
    const where = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.number ? { number: filter.number } : {}),
    } satisfies Prisma.OrderWhereInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          number: true,
          status: true,
          createdAt: true,
          totalTiyin: true,
          user: { select: { phone: true } },
          _count: { select: { sellerOrders: true } },
        },
      }),
    ]);
    return {
      items: rows.map((o) => ({
        number: o.number,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        totalTiyin: o.totalTiyin.toString(),
        customerPhone: o.user.phone,
        storeCount: o._count.sellerOrders,
      })),
      total,
      page,
      pageSize,
    };
  }

  async transitionAsAdmin(
    userId: string,
    number: string,
    sellerOrderId: string,
    to: SellerOrderStatus,
    reason: string | undefined,
  ): Promise<OrderView> {
    const shipment = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, order: { number } },
      select: { id: true },
    });
    if (!shipment) throw notFound();
    await this.transition(shipment.id, to, { actor: 'ADMIN', userId, reason });
    return this.getForAdmin(number);
  }

  async transitionAsCustomer(
    userId: string,
    number: string,
    sellerOrderId: string,
    to: SellerOrderStatus,
    reason: string | undefined,
  ): Promise<OrderView> {
    const owned = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, order: { number, userId } },
      select: { id: true, orderId: true },
    });
    if (!owned) throw notFound();
    await this.transition(owned.id, to, { actor: 'CUSTOMER', userId, reason });
    return this.getForCustomer(userId, number);
  }

  /** A store member moves a shipment. Non-members get 404 (staff use the admin route). */
  async transitionAsSeller(
    userId: string,
    sellerOrderId: string,
    to: SellerOrderStatus,
    reason: string | undefined,
  ): Promise<void> {
    const shipment = await this.prisma.sellerOrder.findFirst({
      where: {
        id: sellerOrderId,
        store: { members: { some: { userId } } },
      },
      select: { id: true },
    });
    if (!shipment) throw notFound();
    await this.transition(shipment.id, to, { actor: 'SELLER', userId, reason });
  }

  async listForSeller(userId: string, storeId: string | undefined) {
    const memberships = await this.prisma.storeMember.findMany({
      where: { userId },
      select: { storeId: true },
    });
    const storeIds = memberships.map((m) => m.storeId);
    if (storeId && !storeIds.includes(storeId)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Not a member of this store');
    }
    const shipments = await this.prisma.sellerOrder.findMany({
      where: { storeId: { in: storeId ? [storeId] : storeIds } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        store: { select: { id: true, slug: true, name: true, isDemo: true } },
        items: { orderBy: { createdAt: 'asc' } },
        order: {
          select: {
            number: true,
            recipientName: true,
            recipientPhone: true,
            addressLine: true,
            district: { select: { name: true } },
          },
        },
      },
    });
    return shipments.map((so) => ({
      id: so.id,
      number: so.number,
      status: so.status,
      store: { ...so.store, name: so.store.name as Names },
      items: so.items.map((item) => ({
        productSlug: item.productSlug,
        title: item.title as Names,
        options: item.options as Names[],
        sku: item.sku,
        unitPriceTiyin: item.unitPriceTiyin.toString(),
        quantity: item.quantity,
        lineTotalTiyin: item.lineTotalTiyin.toString(),
      })),
      itemsTotalTiyin: so.itemsTotalTiyin.toString(),
      deliveryTiyin: so.deliveryTiyin.toString(),
      totalTiyin: so.totalTiyin.toString(),
      allowedTransitions: allowedFor(so.status, 'SELLER'),
      orderNumber: so.order.number,
      createdAt: so.createdAt.toISOString(),
      recipientName: so.order.recipientName,
      recipientPhone: so.order.recipientPhone,
      district: so.order.district.name as Names,
      addressLine: so.order.addressLine,
    }));
  }

  /** Applies one transition atomically: row lock, table check, restock, events, order status. */
  private async transition(
    sellerOrderId: string,
    to: SellerOrderStatus,
    by: { actor: OrderActor; userId: string; reason: string | undefined },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: Tx) => {
      const [locked] = await tx.$queryRaw<{ status: SellerOrderStatus; orderId: string }[]>`
        SELECT "status", "orderId" FROM "SellerOrder" WHERE "id" = ${sellerOrderId}::uuid FOR UPDATE`;
      if (!locked) throw notFound();
      if (!canTransition(locked.status, to, by.actor)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          `Cannot change status from ${locked.status} to ${to}`,
          { from: locked.status, to },
        );
      }
      await tx.sellerOrder.update({ where: { id: sellerOrderId }, data: { status: to } });
      if (RESTOCK_STATUSES.has(to)) {
        const items = await tx.orderItem.findMany({
          where: { sellerOrderId },
          orderBy: { variantId: 'asc' },
          select: { variantId: true, quantity: true },
        });
        for (const item of items) {
          await tx.$executeRaw`
            UPDATE "ProductVariant" SET "stock" = "stock" + ${item.quantity}, "updatedAt" = now()
            WHERE "id" = ${item.variantId}::uuid`;
        }
      }
      await tx.orderEvent.create({
        data: {
          orderId: locked.orderId,
          sellerOrderId,
          actorId: by.userId,
          actorType: by.actor,
          fromStatus: locked.status,
          toStatus: to,
          reason: by.reason ?? null,
        },
      });

      const [order] = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status" FROM "Order" WHERE "id" = ${locked.orderId}::uuid FOR UPDATE`;
      const siblings = await tx.sellerOrder.findMany({
        where: { orderId: locked.orderId },
        select: { status: true },
      });
      const next = deriveOrderStatus(siblings.map((s) => s.status));
      if (order && order.status !== next) {
        await tx.order.update({ where: { id: locked.orderId }, data: { status: next } });
        await tx.orderEvent.create({
          data: {
            orderId: locked.orderId,
            actorId: by.userId,
            actorType: 'SYSTEM',
            fromStatus: order.status,
            toStatus: next,
          },
        });
      }
    });
  }
}
