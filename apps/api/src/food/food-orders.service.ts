import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  FoodCheckoutInput,
  FoodQuote,
  FoodQuoteRequest,
  OrderView,
  RestaurantOrder,
} from '@uzgo/contracts';
import { normalizePhone } from '../auth/phone.js';
import { sha256 } from '../common/crypto.js';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { SellerOrderStatus } from '../generated/prisma/enums.js';
import { lineCommission } from '../ledger/ledger.js';
import { notifySellers } from '../notifications/templates.js';
import {
  allowedFor,
  canonical,
  loadOrderView,
  MAX_UNPAID_ORDERS,
  tashkentYear,
  transitionInTx,
} from '../orders/orders.service.js';
import {
  enabledPaymentMethods,
  FISCAL_METHODS,
  ONLINE_METHODS,
} from '../payments/payment-methods.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { foodConfig } from './food-config.js';
import { RestaurantsService } from './restaurants.service.js';

type Names = { uz: string; ru: string };
type Tx = Prisma.TransactionClient;
type Reason = NonNullable<FoodQuote['reason']>;

const ACTIVE: SellerOrderStatus[] = ['NEW', 'ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY'];

const restaurantSelect = {
  id: true,
  districtId: true,
  commissionBp: true,
  isDemo: true,
  name: true,
  district: { select: { name: true, region: { select: { name: true } } } },
  restaurant: true,
} satisfies Prisma.StoreSelect;

/**
 * Food ordering (ADR 0024): the server prices dishes and delivery, checks
 * hours, area and minimum order, and creates one Order (kind FOOD) with one
 * shipment for the restaurant, in the same way as marketplace checkout.
 */
@Injectable()
export class FoodOrdersService {
  private readonly logger = new Logger(FoodOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    @Inject(ENV) private readonly env: Env,
  ) {
    foodConfig.offerRadiusM = env.FOOD_OFFER_RADIUS_KM * 1000;
  }

  /** Prices a basket; `reason` explains why it cannot be ordered now. */
  private async price(db: Tx | PrismaService, input: FoodQuoteRequest) {
    const store = await db.store.findFirst({
      where: { id: input.restaurantId, kind: 'RESTAURANT', status: 'ACTIVE', deletedAt: null },
      select: restaurantSelect,
    });
    const profile = store?.restaurant;
    if (!store || !profile) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Restaurant not found');
    }
    const dishes = await db.foodMenuItem.findMany({
      where: { id: { in: input.items.map((l) => l.menuItemId) }, storeId: store.id },
    });
    const byId = new Map(dishes.map((d) => [d.id, d]));
    const unavailable = input.items
      .filter((l) => {
        const dish = byId.get(l.menuItemId);
        return !dish || dish.archived || !dish.available;
      })
      .map((l) => l.menuItemId);
    const lines = input.items.flatMap((l) => {
      const dish = byId.get(l.menuItemId);
      return dish
        ? [{ dish, quantity: l.quantity, total: dish.priceTiyin * BigInt(l.quantity) }]
        : [];
    });
    const items = lines.reduce((sum, l) => sum + l.total, 0n);
    const delivery = this.restaurants.deliveryFor(profile, input);
    let reason: Reason | null = null;
    if (unavailable.length > 0) reason = 'ITEM_UNAVAILABLE';
    else if (!profile.acceptingOrders) reason = 'PAUSED';
    else if (!this.restaurants.openNow(profile)) reason = 'CLOSED';
    else if (!delivery.inArea) reason = 'OUT_OF_AREA';
    else if (items < profile.minOrderTiyin) reason = 'MIN_ORDER';
    return { store, profile, lines, unavailable, items, delivery, reason };
  }

  async quote(input: FoodQuoteRequest): Promise<FoodQuote> {
    const p = await this.price(this.prisma, input);
    const fee = p.delivery.inArea ? p.delivery.feeTiyin : 0n;
    return {
      available: p.reason === null,
      reason: p.reason,
      unavailableItemIds: p.unavailable,
      itemsTotalTiyin: p.items.toString(),
      deliveryTiyin: fee.toString(),
      totalTiyin: (p.items + fee).toString(),
      minOrderTiyin: p.profile.minOrderTiyin.toString(),
      distanceM: p.delivery.distanceM,
      etaMinutes: p.delivery.etaMinutes,
    };
  }

  async checkout(
    userId: string,
    input: FoodCheckoutInput,
    idempotencyKey: string,
  ): Promise<OrderView> {
    const requestHash = sha256(canonical(input));
    if (!enabledPaymentMethods(this.env).includes(input.paymentMethod)) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PAYMENT_METHOD_UNAVAILABLE',
        'This payment method is not available',
      );
    }
    const phone = normalizePhone(input.recipientPhone);
    if (!phone) throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_PHONE', 'Invalid phone');
    const online = ONLINE_METHODS.has(input.paymentMethod);

    return this.prisma.$transaction(
      async (tx) => {
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "IdempotencyKey" ("id", "userId", "scope", "key", "requestHash", "response")
          VALUES (gen_random_uuid(), ${userId}::uuid, 'food_checkout', ${idempotencyKey}, ${requestHash}, '{}'::jsonb)
          ON CONFLICT ("userId", "scope", "key") DO NOTHING
          RETURNING "id"`;
        const keyRow = inserted[0];
        if (!keyRow) {
          const existing = await tx.idempotencyKey.findUniqueOrThrow({
            where: {
              userId_scope_key: { userId, scope: 'food_checkout', key: idempotencyKey },
            },
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

        const p = await this.price(tx, input);
        if (p.reason) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'FOOD_UNAVAILABLE',
            'This order cannot be placed now',
            { reason: p.reason, unavailableItemIds: p.unavailable },
          );
        }
        if (FISCAL_METHODS.has(input.paymentMethod)) {
          const missing = p.lines.filter((l) => !l.dish.mxikCode || !l.dish.packageCode);
          if (missing.length > 0 || p.store.isDemo) {
            throw new AppException(
              HttpStatus.CONFLICT,
              'FISCAL_DATA_MISSING',
              'Some dishes cannot be paid online yet',
              { menuItemIds: missing.map((l) => l.dish.id) },
            );
          }
        }
        const districtId = p.store.districtId;
        const district = p.store.district;
        if (!districtId || !district) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'FOOD_UNAVAILABLE',
            'Restaurant has no district',
          );
        }

        const uzgo = p.profile.deliveryMode === 'UZGO';
        const fee = p.delivery.feeTiyin;
        const total = p.items + fee;
        if (total.toString() !== input.expectedTotalTiyin) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'PRICE_CHANGED',
            'Prices have changed',
            { totalTiyin: total.toString() },
          );
        }

        const commissionBp = p.store.commissionBp ?? this.env.COMMISSION_DEFAULT_BP;
        const [{ seq }] = await tx.$queryRaw<
          [{ seq: bigint }]
        >`SELECT nextval('order_number_seq') AS seq`;
        const number = `UZ-${tashkentYear(new Date())}-${seq.toString().padStart(6, '0')}`;

        const order = await tx.order.create({
          data: {
            kind: 'FOOD',
            number,
            userId,
            paymentMethod: input.paymentMethod,
            status: online ? 'AWAITING_PAYMENT' : 'CREATED',
            paymentDueAt: online
              ? new Date(Date.now() + this.env.PAYMENT_WINDOW_MINUTES * 60_000)
              : null,
            itemsTotalTiyin: p.items,
            deliveryTotalTiyin: fee,
            totalTiyin: total,
            recipientName: input.recipientName,
            recipientPhone: phone,
            districtId,
            addressLine: input.addressLine,
            addressSnapshot: {
              district: district.name as Names,
              region: district.region.name as Names,
            },
            comment: input.comment ?? null,
            deliveryLat: input.lat,
            deliveryLng: input.lng,
            foodDeliveryMode: p.profile.deliveryMode,
            sellerOrders: {
              create: {
                number: `${number}-1`,
                status: online ? 'PENDING_PAYMENT' : 'NEW',
                storeId: p.store.id,
                itemsTotalTiyin: p.items,
                // SELF: the restaurant earns its delivery fee; UZGO: the courier does.
                deliveryTiyin: uzgo ? 0n : fee,
                totalTiyin: uzgo ? p.items : total,
                courierFeeTiyin: uzgo ? fee : 0n,
                commissionTiyin: p.lines.reduce(
                  (sum, l) => sum + lineCommission(l.total, commissionBp),
                  0n,
                ),
                items: {
                  create: p.lines.map((l) => ({
                    menuItemId: l.dish.id,
                    productSlug: '',
                    title: l.dish.name as Names,
                    options: [],
                    sku: `FOOD-${l.dish.id.slice(-12)}`,
                    unitPriceTiyin: l.dish.priceTiyin,
                    quantity: l.quantity,
                    lineTotalTiyin: l.total,
                    mxikCode: l.dish.mxikCode,
                    packageCode: l.dish.packageCode,
                    vatRateBp: l.dish.vatRateBp,
                    commissionBp,
                  })),
                },
              },
            },
          },
          select: { id: true, status: true, sellerOrders: { select: { id: true, status: true } } },
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
        // Cash orders reach the kitchen now; online ones once paid (payments module).
        if (!online)
          await notifySellers(
            tx,
            order.sellerOrders.map((so) => so.id),
          );

        const view = await loadOrderView(tx, order.id, 'CUSTOMER', this.env.RETURN_WINDOW_DAYS);
        await tx.idempotencyKey.update({ where: { id: keyRow.id }, data: { response: view } });
        return view;
      },
      { timeout: 20_000 },
    );
  }

  // ─── Restaurant team ───────────────────────────────────────────────────────

  async teamOrders(storeId: string, scope: 'active' | 'all'): Promise<RestaurantOrder[]> {
    const rows = await this.prisma.sellerOrder.findMany({
      where: {
        storeId,
        order: { kind: 'FOOD' },
        status: scope === 'active' ? { in: ACTIVE } : { not: 'PENDING_PAYMENT' },
      },
      orderBy: { createdAt: scope === 'active' ? 'asc' : 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        createdAt: true,
        itemsTotalTiyin: true,
        totalTiyin: true,
        courierId: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: { title: true, quantity: true, lineTotalTiyin: true },
        },
        courier: { select: { phone: true, profile: { select: { firstName: true } } } },
        order: {
          select: {
            number: true,
            paymentMethod: true,
            paidAt: true,
            totalTiyin: true,
            foodDeliveryMode: true,
            recipientName: true,
            recipientPhone: true,
            addressLine: true,
            comment: true,
            deliveryLat: true,
            deliveryLng: true,
          },
        },
      },
    });
    return rows.map((so) => {
      const mode = so.order.foodDeliveryMode ?? 'SELF';
      const allowed = allowedFor(so.status, 'SELLER', 'FOOD').filter(
        (to) =>
          mode === 'SELF' || !['HANDED_TO_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED'].includes(to),
      );
      const acceptBy =
        so.status === 'NEW'
          ? new Date(
              (so.order.paidAt ?? so.createdAt).getTime() +
                this.env.FOOD_ACCEPT_TIMEOUT_MINUTES * 60_000,
            ).toISOString()
          : null;
      return {
        id: so.id,
        orderNumber: so.order.number,
        status: so.status,
        createdAt: so.createdAt.toISOString(),
        acceptBy,
        items: so.items.map((i) => ({
          name: i.title as Names,
          quantity: i.quantity,
          lineTotalTiyin: i.lineTotalTiyin.toString(),
        })),
        itemsTotalTiyin: so.itemsTotalTiyin.toString(),
        totalTiyin: so.totalTiyin.toString(),
        paymentMethod: so.order.paymentMethod,
        collectTiyin:
          mode === 'SELF' && so.order.paymentMethod === 'CASH_ON_DELIVERY'
            ? so.order.totalTiyin.toString()
            : null,
        deliveryMode: mode,
        recipientName: so.order.recipientName,
        recipientPhone: so.order.recipientPhone,
        addressLine: so.order.addressLine,
        destination: { lat: so.order.deliveryLat ?? 0, lng: so.order.deliveryLng ?? 0 },
        comment: so.order.comment,
        courier: so.courier
          ? { name: so.courier.profile?.firstName ?? null, phone: so.courier.phone }
          : null,
        allowedTransitions: allowed,
      };
    });
  }

  async setAccepting(storeId: string, acceptingOrders: boolean) {
    await this.prisma.restaurantProfile.update({
      where: { storeId },
      data: { acceptingOrders },
    });
  }

  async setAvailability(storeId: string, itemId: string, available: boolean) {
    const updated = await this.prisma.foodMenuItem.updateMany({
      where: { id: itemId, storeId, archived: false },
      data: { available },
    });
    if (updated.count === 0) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Dish not found');
    }
  }

  /**
   * Orders a restaurant did not accept in time are cancelled by the system
   * (online payments are refunded by the ledger hook). Returns how many.
   */
  async cancelUnaccepted(now = new Date()): Promise<number> {
    const deadline = new Date(now.getTime() - this.env.FOOD_ACCEPT_TIMEOUT_MINUTES * 60_000);
    const stale = await this.prisma.sellerOrder.findMany({
      where: {
        status: 'NEW',
        order: {
          kind: 'FOOD',
          OR: [
            { paidAt: { lt: deadline } },
            { paidAt: null, paymentMethod: 'CASH_ON_DELIVERY', createdAt: { lt: deadline } },
          ],
        },
      },
      take: 100,
      select: { id: true },
    });
    let cancelled = 0;
    for (const so of stale) {
      try {
        await this.prisma.$transaction((tx) =>
          transitionInTx(tx, so.id, 'CANCELLED_BY_SELLER', {
            actor: 'SYSTEM',
            userId: null,
            reason: 'Not accepted in time',
          }),
        );
        cancelled += 1;
      } catch (err) {
        // Accepted meanwhile (state changed): nothing to do.
        if (!(err instanceof AppException)) throw err;
        this.logger.debug({ id: so.id }, 'Skipped: no longer NEW');
      }
    }
    return cancelled;
  }
}
