import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  CheckoutInput,
  OrderView,
  SellerOrderStatus as ContractSellerOrderStatus,
} from '@uzgo/contracts';
import { isVariantSellable, variantSelect } from '../cart/cart.service.js';
import { sha256 } from '../common/crypto.js';
import { AppException } from '../common/http-exception.filter.js';
import { normalizePhone } from '../auth/phone.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import {
  enabledPaymentMethods,
  FISCAL_METHODS,
  ONLINE_METHODS,
} from '../payments/payment-methods.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  OrderActor,
  OrderKind,
  OrderStatus,
  ReturnReason,
  SellerOrderStatus,
} from '../generated/prisma/enums.js';
import { planDelivery } from '../delivery/delivery.js';
import {
  notifyCourierOffer,
  notifySellers,
  notifyShipmentStatus,
} from '../notifications/templates.js';
import { foodConfig } from '../food/food-config.js';
import { lineCommission, onShipmentTransition, resolveCommissionBp } from '../ledger/ledger.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { foodOrderInfo, foodShipmentInclude } from '../food/food-view.js';
import { allocate } from '../promo/promo.js';
import { PromoService } from '../promo/promo.service.js';
import {
  canTransition,
  deriveOrderStatus,
  RESTOCK_STATUSES,
  transitionsFor,
} from './state-machine.js';

/** Open online orders awaiting payment per customer (each holds stock). */
export const MAX_UNPAID_ORDERS = 3;

type Names = { uz: string; ru: string };
type Tx = Prisma.TransactionClient;
export type TransitionInput = {
  to: SellerOrderStatus;
  reason?: string | undefined;
  returnReason?: ReturnReason | undefined;
  returnComment?: string | undefined;
};

const orderInclude = {
  district: { select: { name: true, region: { select: { name: true } } } },
  promoCode: { select: { code: true } },
  sellerOrders: {
    orderBy: { number: 'asc' },
    include: {
      ...foodShipmentInclude,
      items: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
    },
  },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Stable JSON (sorted keys) so equal requests hash equally. */
export function canonical(value: unknown): string {
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
export function tashkentYear(date: Date): string {
  return new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Tashkent' }).format(date);
}

export function allowedFor(
  status: SellerOrderStatus,
  actor: OrderActor,
  kind: OrderKind = 'MARKET',
): ContractSellerOrderStatus[] {
  const options = transitionsFor(kind)[status];
  return options.filter((t) => t.actors.includes(actor)).map((t) => t.to);
}

function pickupView(snapshot: unknown): OrderView['pickupPoint'] {
  const point = (snapshot as { pickupPoint?: OrderView['pickupPoint'] } | null)?.pickupPoint;
  return point ?? null;
}

function paymentView(order: {
  paymentMethod: string;
  status: string;
  paymentDueAt: Date | null;
  paidAt: Date | null;
}): OrderView['payment'] {
  const due = order.paymentDueAt?.toISOString() ?? null;
  const paidAt = order.paidAt?.toISOString() ?? null;
  if (order.paymentMethod === 'CASH_ON_DELIVERY') {
    return { status: 'NOT_REQUIRED', dueAt: null, paidAt: null };
  }
  if (order.paidAt && order.status === 'CANCELLED')
    return { status: 'REFUNDED', dueAt: due, paidAt };
  if (order.paidAt) return { status: 'PAID', dueAt: due, paidAt };
  if (order.status === 'AWAITING_PAYMENT') return { status: 'UNPAID', dueAt: due, paidAt: null };
  return { status: 'EXPIRED', dueAt: due, paidAt: null };
}

type ShipmentExtras = {
  status: SellerOrderStatus;
  carrier: string | null;
  trackingCode: string | null;
  deliveredAt: Date | null;
  returnReason: ReturnReason | null;
  returnComment: string | null;
  returnDecisionNote: string | null;
  events: { toStatus: string; createdAt: Date }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Last moment for an in-app return request, counted from delivery. */
export function returnDeadline(deliveredAt: Date | null, windowDays: number): Date | null {
  return deliveredAt ? new Date(deliveredAt.getTime() + windowDays * DAY_MS) : null;
}

/**
 * Tracking, status history and return details shown to the customer and the
 * seller. A return can no longer be requested once the window has passed.
 */
function shipmentExtras(
  so: ShipmentExtras,
  actor: OrderActor,
  windowDays: number,
  kind: OrderKind = 'MARKET',
) {
  const until = returnDeadline(so.deliveredAt, windowDays);
  const windowOpen = until !== null && until.getTime() >= Date.now();
  return {
    allowedTransitions: allowedFor(so.status, actor, kind).filter(
      (to) => to !== 'RETURN_REQUESTED' || windowOpen,
    ),
    tracking: so.carrier && so.trackingCode ? { carrier: so.carrier, code: so.trackingCode } : null,
    timeline: so.events.map((e) => ({
      status: e.toStatus as SellerOrderStatus,
      at: e.createdAt.toISOString(),
    })),
    deliveredAt: so.deliveredAt?.toISOString() ?? null,
    returnUntil: until?.toISOString() ?? null,
    returnRequest:
      so.returnReason && so.returnComment !== null
        ? { reason: so.returnReason, comment: so.returnComment }
        : null,
    returnDecisionNote: so.returnDecisionNote,
  };
}

export function toOrderView(order: OrderRow, actor: OrderActor, windowDays: number): OrderView {
  const first = order.sellerOrders[0];
  return {
    number: order.number,
    kind: order.kind,
    status: order.status,
    paymentMethod: order.paymentMethod,
    payment: paymentView(order),
    deliveryType: order.deliveryType,
    pickupPoint: pickupView(order.addressSnapshot),
    createdAt: order.createdAt.toISOString(),
    itemsTotalTiyin: order.itemsTotalTiyin.toString(),
    deliveryTotalTiyin: order.deliveryTotalTiyin.toString(),
    discountTiyin: order.discountTiyin.toString(),
    promoCode: order.promoCode?.code ?? null,
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
      store: {
        id: so.store.id,
        slug: so.store.slug,
        name: so.store.name as Names,
        isDemo: so.store.isDemo,
      },
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
      discountTiyin: so.discountTiyin.toString(),
      ...shipmentExtras(so, actor, windowDays, order.kind),
    })),
    food: order.kind === 'FOOD' && first ? foodOrderInfo(order, first) : null,
  };
}

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');

/** Order view by id inside any transaction (food checkout, idempotent replies). */
export async function loadOrderView(
  db: Tx,
  orderId: string,
  actor: OrderActor,
  windowDays: number,
): Promise<OrderView> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  return toOrderView(order, actor, windowDays);
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promo: PromoService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Checkout of the user's whole cart, in one transaction:
   * idempotency key → server-side totals → conditional stock decrements →
   * Order + one SellerOrder per store + item snapshots + events → cart cleared.
   */
  async checkout(userId: string, input: CheckoutInput, idempotencyKey: string): Promise<OrderView> {
    const requestHash = sha256(canonical(input));
    if (!enabledPaymentMethods(this.env).includes(input.paymentMethod)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PAYMENT_METHOD_UNAVAILABLE',
        'This payment method is not available',
      );
    }
    const online = ONLINE_METHODS.has(input.paymentMethod);
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

        // Unpaid online orders hold stock; cap them so one account cannot
        // reserve a seller's whole stock (SECURITY.md, Phase 7 review).
        if (online) {
          const unpaid = await tx.order.count({ where: { userId, status: 'AWAITING_PAYMENT' } });
          if (unpaid >= MAX_UNPAID_ORDERS) {
            throw new AppException(
              HttpStatus.CONFLICT,
              'TOO_MANY_UNPAID_ORDERS',
              'Pay or cancel your unpaid orders first',
            );
          }
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

        // Online payments with a real provider print fiscal receipts: every item
        // needs its IKPU (MXIK) and package code, and demo stores are never sold online.
        if (FISCAL_METHODS.has(input.paymentMethod)) {
          const missing = lines.filter(
            (l) => !l.variant.mxikCode || !l.variant.packageCode || l.variant.product.store.isDemo,
          );
          if (missing.length > 0) {
            throw new AppException(
              HttpStatus.CONFLICT,
              'FISCAL_DATA_MISSING',
              'Some items cannot be paid online yet',
              { variantIds: missing.map((l) => l.variant.id) },
            );
          }
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

        // Totals are computed here from current prices and delivery tariffs only.
        const byStore = Map.groupBy(lines, (l) => l.variant.product.store.id);
        const delivery = await planDelivery(tx, {
          districtId: district.id,
          type: input.deliveryType,
          pickupPointId: input.pickupPointId,
        });
        const storeTotals = new Map(
          [...byStore.entries()].map(([storeId, storeLines]) => {
            const items = storeLines.reduce(
              (sum, l) => sum + l.variant.priceTiyin * BigInt(l.quantity),
              0n,
            );
            return [storeId, { items, delivery: delivery.feeFor(items) }];
          }),
        );
        let itemsTotal = 0n;
        let deliveryTotal = 0n;
        for (const t of storeTotals.values()) {
          itemsTotal += t.items;
          deliveryTotal += t.delivery;
        }
        // Promo (ADR 0023): the code row is locked so its limits hold under
        // concurrent checkouts; the discount is split over the lines.
        const promo = input.promoCode
          ? await this.promo.evaluate(userId, input.promoCode, itemsTotal, { tx, lock: true })
          : null;
        const discount = promo?.discountTiyin ?? 0n;
        const lineDiscounts = new Map(
          allocate(
            discount,
            lines.map((l) => l.variant.priceTiyin * BigInt(l.quantity)),
          ).map((d, i) => [lines[i]?.variant.id ?? '', d]),
        );
        const discountOf = (variantId: string) => lineDiscounts.get(variantId) ?? 0n;
        const total = itemsTotal + deliveryTotal - discount;
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

        // Commission rates are resolved now and frozen on the order (snapshot).
        const [categories, products] = await Promise.all([
          tx.category.findMany({ select: { id: true, parentId: true, commissionBp: true } }),
          tx.product.findMany({
            where: { id: { in: lines.map((l) => l.variant.product.id) } },
            select: { id: true, categoryId: true, store: { select: { commissionBp: true } } },
          }),
        ]);
        const categoryMap = new Map(categories.map((c) => [c.id, c]));
        const productMap = new Map(products.map((p) => [p.id, p]));
        const commissionBpOf = (productId: string): number => {
          const product = productMap.get(productId);
          if (!product) return this.env.COMMISSION_DEFAULT_BP;
          return resolveCommissionBp(
            product.store.commissionBp,
            product.categoryId,
            categoryMap,
            this.env.COMMISSION_DEFAULT_BP,
          );
        };

        const [{ seq }] = await tx.$queryRaw<
          [{ seq: bigint }]
        >`SELECT nextval('order_number_seq') AS seq`;
        const number = `UZ-${tashkentYear(new Date())}-${seq.toString().padStart(6, '0')}`;

        const order = await tx.order.create({
          data: {
            number,
            userId,
            paymentMethod: input.paymentMethod,
            status: online ? 'AWAITING_PAYMENT' : 'CREATED',
            paymentDueAt: online
              ? new Date(Date.now() + this.env.PAYMENT_WINDOW_MINUTES * 60_000)
              : null,
            itemsTotalTiyin: itemsTotal,
            deliveryTotalTiyin: deliveryTotal,
            discountTiyin: discount,
            promoCodeId: promo?.id ?? null,
            totalTiyin: total,
            recipientName: input.recipientName,
            recipientPhone: phone,
            districtId: district.id,
            deliveryType: input.deliveryType,
            pickupPointId: delivery.pickupPoint?.id ?? null,
            addressLine: delivery.pickupPoint?.address ?? input.addressLine ?? '',
            addressSnapshot: {
              district: district.name as Names,
              region: district.region.name as Names,
              ...(delivery.pickupPoint
                ? {
                    pickupPoint: {
                      name: delivery.pickupPoint.name as Names,
                      address: delivery.pickupPoint.address,
                      hours: delivery.pickupPoint.hours,
                    },
                  }
                : {}),
            },
            comment: input.comment ?? null,
            sellerOrders: {
              create: [...byStore.values()].map((storeLines, index) => {
                const storeId = storeLines[0]?.variant.product.store.id ?? '';
                const totals = storeTotals.get(storeId) ?? { items: 0n, delivery: 0n };
                const commission = storeLines.reduce(
                  (sum, l) =>
                    sum +
                    lineCommission(
                      l.variant.priceTiyin * BigInt(l.quantity),
                      commissionBpOf(l.variant.product.id),
                    ),
                  0n,
                );
                return {
                  number: `${number}-${String(index + 1)}`,
                  commissionTiyin: commission,
                  status: online ? 'PENDING_PAYMENT' : 'NEW',
                  storeId,
                  itemsTotalTiyin: totals.items,
                  deliveryTiyin: totals.delivery,
                  totalTiyin: totals.items + totals.delivery,
                  discountTiyin: storeLines.reduce((sum, l) => sum + discountOf(l.variant.id), 0n),
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
                      discountTiyin: discountOf(l.variant.id),
                      mxikCode: l.variant.mxikCode,
                      packageCode: l.variant.packageCode,
                      vatRateBp: l.variant.vatRateBp,
                      commissionBp: commissionBpOf(l.variant.product.id),
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
            { orderId: order.id, actorId: userId, actorType: 'CUSTOMER', toStatus: order.status },
            ...order.sellerOrders.map((so) => ({
              orderId: order.id,
              sellerOrderId: so.id,
              actorId: userId,
              actorType: 'CUSTOMER' as const,
              toStatus: so.status,
            })),
          ],
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        // Cash orders go to the sellers now; online orders once they are paid.
        if (!online)
          await notifySellers(
            tx,
            order.sellerOrders.map((so) => so.id),
          );

        const view = toOrderView(order, 'CUSTOMER', this.env.RETURN_WINDOW_DAYS);
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
    // Rides have their own history (GET /rides, ADR 0025).
    const orders = await this.prisma.order.findMany({
      where: { userId, kind: { not: 'RIDE' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        number: true,
        kind: true,
        status: true,
        createdAt: true,
        totalTiyin: true,
        sellerOrders: { select: { items: { select: { quantity: true } } } },
      },
    });
    return orders.map((o) => ({
      number: o.number,
      kind: o.kind,
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
    return toOrderView(order, 'CUSTOMER', this.env.RETURN_WINDOW_DAYS);
  }

  /** Staff view of any order. Callers must enforce staff roles and the second factor. */
  async getForAdmin(number: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({ where: { number }, include: orderInclude });
    if (!order) throw notFound();
    return toOrderView(order, 'ADMIN', this.env.RETURN_WINDOW_DAYS);
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
    input: TransitionInput,
  ): Promise<OrderView> {
    const shipment = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, order: { number } },
      select: { id: true },
    });
    if (!shipment) throw notFound();
    await this.transition(shipment.id, input, { actor: 'ADMIN', userId });
    return this.getForAdmin(number);
  }

  async transitionAsCustomer(
    userId: string,
    number: string,
    sellerOrderId: string,
    input: TransitionInput,
  ): Promise<OrderView> {
    const owned = await this.prisma.sellerOrder.findFirst({
      where: { id: sellerOrderId, order: { number, userId } },
      select: { id: true, orderId: true },
    });
    if (!owned) throw notFound();
    await this.transition(owned.id, input, { actor: 'CUSTOMER', userId });
    return this.getForCustomer(userId, number);
  }

  /** A store member moves a shipment. Non-members get 404 (staff use the admin route). */
  async transitionAsSeller(
    userId: string,
    sellerOrderId: string,
    input: TransitionInput,
  ): Promise<void> {
    const shipment = await this.prisma.sellerOrder.findFirst({
      where: {
        id: sellerOrderId,
        store: { members: { some: { userId } } },
      },
      select: { id: true },
    });
    if (!shipment) throw notFound();
    await this.transition(shipment.id, input, { actor: 'SELLER', userId });
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
      // Unpaid online orders stay hidden from sellers until the payment arrives.
      where: {
        storeId: { in: storeId ? [storeId] : storeIds },
        status: { not: 'PENDING_PAYMENT' },
        // Food orders have their own restaurant screen (ADR 0024).
        order: { kind: 'MARKET' },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        store: { select: { id: true, slug: true, name: true, isDemo: true } },
        items: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
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
      discountTiyin: so.discountTiyin.toString(),
      ...shipmentExtras(so, 'SELLER', this.env.RETURN_WINDOW_DAYS),
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
    input: TransitionInput,
    by: { actor: OrderActor; userId: string },
  ): Promise<void> {
    await this.prisma.$transaction((tx: Tx) =>
      transitionInTx(tx, sellerOrderId, input.to, {
        ...by,
        reason: input.reason,
        ...(input.to === 'RETURN_REQUESTED'
          ? {
              returnRequest: {
                reason: input.returnReason,
                comment: input.returnComment,
                windowDays: this.env.RETURN_WINDOW_DAYS,
              },
            }
          : {}),
      }),
    );
  }
}

/**
 * Food delivery rules (ADR 0024): with SELF delivery the restaurant hands
 * over and delivers; with UZGO delivery only the assigned courier (or staff)
 * does, and the food leaves the kitchen only with a courier.
 */
function foodActorAllowed(
  locked: { courierId: string | null; foodDeliveryMode: 'SELF' | 'UZGO' | null },
  to: SellerOrderStatus,
  by: { actor: OrderActor; userId: string | null },
): boolean {
  const delivery = to === 'HANDED_TO_DELIVERY' || to === 'DELIVERED' || to === 'DELIVERY_FAILED';
  if (by.actor === 'COURIER') {
    return locked.foodDeliveryMode === 'UZGO' && locked.courierId === by.userId && delivery;
  }
  if (locked.foodDeliveryMode === 'UZGO' && delivery) {
    if (by.actor === 'SELLER') return false;
    if (to === 'HANDED_TO_DELIVERY') return locked.courierId !== null;
  }
  return true;
}

/**
 * Extra columns written with a transition (ADR 0023): the delivery time that
 * starts the return window, the customer's return request (inside the window
 * only) and the decision note (required when a return is rejected).
 */
function returnFields(
  deliveredAt: Date | null,
  to: SellerOrderStatus,
  by: {
    reason: string | undefined;
    returnRequest?: {
      reason: ReturnReason | undefined;
      comment: string | undefined;
      windowDays: number;
    };
  },
): Prisma.SellerOrderUpdateInput {
  if (to === 'DELIVERED') return { deliveredAt: new Date() };
  if (to === 'RETURN_REQUESTED') {
    const request = by.returnRequest;
    if (!request?.reason || !request.comment) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'RETURN_REASON_REQUIRED',
        'A return needs a reason and a comment',
      );
    }
    const until = returnDeadline(deliveredAt, request.windowDays);
    if (!until || until.getTime() < Date.now()) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'RETURN_WINDOW_CLOSED',
        'The return window for this shipment has closed',
        { returnUntil: until?.toISOString() ?? null },
      );
    }
    return { returnReason: request.reason, returnComment: request.comment };
  }
  if (to === 'RETURN_REJECTED') {
    const note = by.reason?.trim();
    if (!note || note.length < 3) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'DECISION_NOTE_REQUIRED',
        'Explain to the customer why the return is rejected',
      );
    }
    return { returnDecisionNote: note };
  }
  if (to === 'RETURNED') return { returnDecisionNote: by.reason?.trim() || null };
  return {};
}

/**
 * One shipment transition inside an existing transaction: row lock, state
 * table check, restock, events, derived order status. Used by order routes and
 * by the payments module (payment confirmed / unpaid order cancelled).
 */
export async function transitionInTx(
  tx: Tx,
  sellerOrderId: string,
  to: SellerOrderStatus,
  by: {
    actor: OrderActor;
    userId: string | null;
    reason: string | undefined;
    /** The provider already returned the whole payment: no per-shipment refund. */
    providerRefunded?: boolean;
    /** Customer's return request (to RETURN_REQUESTED). */
    returnRequest?: {
      reason: ReturnReason | undefined;
      comment: string | undefined;
      windowDays: number;
    };
  },
): Promise<void> {
  const [locked] = await tx.$queryRaw<
    {
      status: SellerOrderStatus;
      orderId: string;
      deliveredAt: Date | null;
      courierId: string | null;
      kind: OrderKind;
      foodDeliveryMode: 'SELF' | 'UZGO' | null;
    }[]
  >`
    SELECT so."status", so."orderId", so."deliveredAt", so."courierId",
           o."kind", o."foodDeliveryMode"
    FROM "SellerOrder" so JOIN "Order" o ON o."id" = so."orderId"
    WHERE so."id" = ${sellerOrderId}::uuid FOR UPDATE OF so`;
  if (!locked) throw notFound();
  if (
    !canTransition(locked.status, to, by.actor, locked.kind) ||
    (locked.kind === 'FOOD' && !foodActorAllowed(locked, to, by))
  ) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'INVALID_STATE_TRANSITION',
      `Cannot change status from ${locked.status} to ${to}`,
      { from: locked.status, to },
    );
  }
  await tx.sellerOrder.update({
    where: { id: sellerOrderId },
    data: {
      status: to,
      ...returnFields(locked.deliveredAt, to, by),
      ...(to === 'ACCEPTED' ? { acceptedAt: new Date() } : {}),
      ...(to === 'PACKED' ? { readyAt: new Date() } : {}),
    },
  });
  await onShipmentTransition(tx, sellerOrderId, to, {
    providerRefunded: by.providerRefunded ?? false,
  });
  await notifyShipmentStatus(tx, sellerOrderId, to);
  // UZGO-courier food: nearby couriers hear about the job as cooking starts.
  if (locked.kind === 'FOOD' && locked.foodDeliveryMode === 'UZGO' && to === 'ACCEPTED') {
    await notifyCourierOffer(tx, sellerOrderId, foodConfig.offerRadiusM);
  }
  if (RESTOCK_STATUSES.has(to)) {
    // Food dishes have no stock: only marketplace lines go back to the shelf.
    const items = await tx.orderItem.findMany({
      where: { sellerOrderId, variantId: { not: null } },
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
}
