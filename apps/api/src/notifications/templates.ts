import type { Prisma } from '../generated/prisma/client.js';
import type { RideStatus, SellerOrderStatus } from '../generated/prisma/enums.js';

type Tx = Prisma.TransactionClient;
type Locale = 'uz' | 'ru';

/** Short texts without personal data (no address, no full name). */
const CUSTOMER: Partial<Record<SellerOrderStatus, Record<Locale, (n: string) => string>>> = {
  ACCEPTED: {
    uz: (n) => `UZGO: ${n} joʻnatmangiz sotuvchi tomonidan qabul qilindi.`,
    ru: (n) => `UZGO: продавец принял отправление ${n}.`,
  },
  HANDED_TO_DELIVERY: {
    uz: (n) => `UZGO: ${n} joʻnatmangiz yetkazishga topshirildi.`,
    ru: (n) => `UZGO: отправление ${n} передано в доставку.`,
  },
  DELIVERED: {
    uz: (n) => `UZGO: ${n} joʻnatmangiz yetkazildi. Xaridingiz uchun rahmat!`,
    ru: (n) => `UZGO: отправление ${n} доставлено. Спасибо за покупку!`,
  },
  CANCELLED_BY_SELLER: {
    uz: (n) => `UZGO: ${n} joʻnatmangiz sotuvchi tomonidan bekor qilindi.`,
    ru: (n) => `UZGO: продавец отменил отправление ${n}.`,
  },
  DELIVERY_FAILED: {
    uz: (n) => `UZGO: ${n} joʻnatmangizni yetkazib boʻlmadi.`,
    ru: (n) => `UZGO: не удалось доставить отправление ${n}.`,
  },
};

/** Food orders move fast: texts say what happens in the kitchen and on the road. */
const FOOD_CUSTOMER: Partial<Record<SellerOrderStatus, Record<Locale, (n: string) => string>>> = {
  ACCEPTED: {
    uz: (n) => `UZGO Food: ${n} buyurtmangiz tayyorlanmoqda.`,
    ru: (n) => `UZGO Food: заказ ${n} готовится.`,
  },
  HANDED_TO_DELIVERY: {
    uz: (n) => `UZGO Food: ${n} buyurtmangiz yoʻlda.`,
    ru: (n) => `UZGO Food: заказ ${n} в пути.`,
  },
  DELIVERED: {
    uz: (n) => `UZGO Food: ${n} yetkazildi. Yoqimli ishtaha!`,
    ru: (n) => `UZGO Food: заказ ${n} доставлен. Приятного аппетита!`,
  },
  CANCELLED_BY_SELLER: {
    uz: (n) => `UZGO Food: ${n} buyurtmangizni restoran bekor qildi.`,
    ru: (n) => `UZGO Food: ресторан отменил заказ ${n}.`,
  },
  DELIVERY_FAILED: {
    uz: (n) => `UZGO Food: ${n} buyurtmangizni yetkazib boʻlmadi.`,
    ru: (n) => `UZGO Food: не удалось доставить заказ ${n}.`,
  },
};
/** Food: SMS only when something went wrong; the rest goes to the app. */
const FOOD_SMS = new Set<SellerOrderStatus>(['CANCELLED_BY_SELLER', 'DELIVERY_FAILED']);

const COURIER_OFFER =
  'UZGO: yangi yetkazish taklifi yaqin atrofda. / Новый заказ на доставку рядом.';

const PAID: Record<Locale, (n: string) => string> = {
  uz: (n) => `UZGO: ${n} buyurtmangiz uchun toʻlov qabul qilindi.`,
  ru: (n) => `UZGO: оплата заказа ${n} получена.`,
};

const sellerNew = (shipment: string, items: number) =>
  `UZGO: yangi buyurtma ${shipment} (${String(items)} ta mahsulot). Sotuvchi panelida tasdiqlang.`;

const localeOf = (value: string): Locale => (value === 'ru' ? 'ru' : 'uz');

type Row = {
  channel: 'SMS' | 'TELEGRAM' | 'PUSH';
  recipient: string;
  text: string;
  template: string;
  orderId: string;
  data?:
    | { type: 'order'; number: string }
    | { type: 'shipment'; storeId: string }
    | { type: 'courier' }
    | { type: 'ride'; number: string }
    | { type: 'driver' };
};

async function enqueue(tx: Tx, rows: Row[]) {
  if (rows.length > 0) await tx.notification.createMany({ data: rows });
}

/** Users that have at least one phone registered for push (ADR 0022). */
async function withPushDevices(tx: Tx, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await tx.pushDevice.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return new Set(rows.map((r) => r.userId));
}

/** Same text as the SMS, without the "UZGO: " prefix (the push title says UZGO). */
const pushText = (text: string) => text.replace(/^UZGO: /, '');

/** Customer: shipment status changes they care about. */
export async function notifyShipmentStatus(tx: Tx, sellerOrderId: string, to: SellerOrderStatus) {
  const shipment = await tx.sellerOrder.findUniqueOrThrow({
    where: { id: sellerOrderId },
    select: {
      number: true,
      orderId: true,
      order: {
        select: {
          number: true,
          kind: true,
          user: { select: { id: true, phone: true, locale: true } },
        },
      },
    },
  });
  if (to === 'NEW') {
    await notifySellers(tx, [sellerOrderId]);
    return;
  }
  const food = shipment.order.kind === 'FOOD';
  const template = (food ? FOOD_CUSTOMER : CUSTOMER)[to];
  if (!template) return;
  const user = shipment.order.user;
  const number = food ? shipment.order.number : shipment.number;
  const text = template[localeOf(user.locale)](number);
  const name = `${food ? 'food' : 'shipment'}.${to.toLowerCase()}`;
  const rows: Row[] =
    !food || FOOD_SMS.has(to)
      ? [{ channel: 'SMS', recipient: user.phone, text, template: name, orderId: shipment.orderId }]
      : [];
  if ((await withPushDevices(tx, [user.id])).has(user.id)) {
    rows.push({
      channel: 'PUSH',
      recipient: user.id,
      text: pushText(text),
      template: name,
      orderId: shipment.orderId,
      data: { type: 'order', number: shipment.order.number },
    });
  }
  await enqueue(tx, rows);
}

/** Customer: online payment received. */
export async function notifyOrderPaid(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { number: true, user: { select: { id: true, phone: true, locale: true } } },
  });
  const text = PAID[localeOf(order.user.locale)](order.number);
  const rows: Row[] = [
    { channel: 'SMS', recipient: order.user.phone, text, template: 'order.paid', orderId },
  ];
  if ((await withPushDevices(tx, [order.user.id])).has(order.user.id)) {
    rows.push({
      channel: 'PUSH',
      recipient: order.user.id,
      text: pushText(text),
      template: 'order.paid',
      orderId,
      data: { type: 'order', number: order.number },
    });
  }
  await enqueue(tx, rows);
}

/** Store owners (SMS), the store's Telegram chat and members' phones (push): a new shipment. */
export async function notifySellers(tx: Tx, sellerOrderIds: string[]) {
  const shipments = await tx.sellerOrder.findMany({
    where: { id: { in: sellerOrderIds } },
    select: {
      number: true,
      orderId: true,
      items: { select: { quantity: true } },
      store: {
        select: {
          id: true,
          telegramChatId: true,
          members: { select: { role: true, user: { select: { id: true, phone: true } } } },
        },
      },
    },
  });
  const pushUsers = await withPushDevices(
    tx,
    shipments.flatMap((s) => s.store.members.map((m) => m.user.id)),
  );
  const rows = shipments.flatMap((s): Row[] => {
    const text = sellerNew(
      s.number,
      s.items.reduce((n, i) => n + i.quantity, 0),
    );
    return [
      ...s.store.members
        .filter((m) => m.role === 'OWNER')
        .map((m) => ({
          channel: 'SMS' as const,
          recipient: m.user.phone,
          text,
          template: 'seller.new_order',
          orderId: s.orderId,
        })),
      ...s.store.members
        .filter((m) => pushUsers.has(m.user.id))
        .map((m) => ({
          channel: 'PUSH' as const,
          recipient: m.user.id,
          text: pushText(text),
          template: 'seller.new_order',
          orderId: s.orderId,
          data: { type: 'shipment' as const, storeId: s.store.id },
        })),
      ...(s.store.telegramChatId
        ? [
            {
              channel: 'TELEGRAM' as const,
              recipient: s.store.telegramChatId,
              text,
              template: 'seller.new_order',
              orderId: s.orderId,
            },
          ]
        : []),
    ];
  });
  await enqueue(tx, rows);
}

/**
 * New UZGO-courier job (ADR 0024): push to online, active couriers whose
 * last position is within `radiusM` of the restaurant. No personal data.
 */
export async function notifyCourierOffer(tx: Tx, sellerOrderId: string, radiusM: number) {
  const shipment = await tx.sellerOrder.findUniqueOrThrow({
    where: { id: sellerOrderId },
    select: {
      orderId: true,
      store: { select: { restaurant: { select: { lat: true, lng: true } } } },
    },
  });
  const origin = shipment.store.restaurant;
  if (!origin) return;
  // ~1° latitude = 111 km: a bounding box first, exact distance below.
  const dLat = radiusM / 111_000;
  const dLng = radiusM / (111_000 * Math.cos((origin.lat * Math.PI) / 180));
  const couriers = await tx.courierProfile.findMany({
    where: {
      status: 'ACTIVE',
      online: true,
      lastLat: { gte: origin.lat - dLat, lte: origin.lat + dLat },
      lastLng: { gte: origin.lng - dLng, lte: origin.lng + dLng },
      lastSeenAt: { gte: new Date(Date.now() - 15 * 60_000) },
    },
    take: 50,
    select: { userId: true },
  });
  const pushUsers = await withPushDevices(
    tx,
    couriers.map((c) => c.userId),
  );
  await enqueue(
    tx,
    [...pushUsers].map((userId) => ({
      channel: 'PUSH' as const,
      recipient: userId,
      text: COURIER_OFFER,
      template: 'courier.offer',
      orderId: shipment.orderId,
      data: { type: 'courier' as const },
    })),
  );
}

// ─── UZGO Go (ADR 0025) ─────────────────────────────────────────────────────

const RIDER: Partial<Record<RideStatus, Record<Locale, (n: string) => string>>> = {
  ACCEPTED: {
    uz: (n) => `UZGO Go: ${n} — haydovchi yoʻlda, sizga kelmoqda.`,
    ru: (n) => `UZGO Go: ${n} — водитель едет к вам.`,
  },
  ARRIVED: {
    uz: (n) => `UZGO Go: ${n} — haydovchi yetib keldi va sizni kutmoqda.`,
    ru: (n) => `UZGO Go: ${n} — водитель на месте и ждёт вас.`,
  },
  COMPLETED: {
    uz: (n) => `UZGO Go: ${n} — safar yakunlandi. Rahmat!`,
    ru: (n) => `UZGO Go: ${n} — поездка завершена. Спасибо!`,
  },
  CANCELLED: {
    uz: (n) => `UZGO Go: ${n} — safar bekor qilindi.`,
    ru: (n) => `UZGO Go: ${n} — поездка отменена.`,
  },
  NO_DRIVER: {
    uz: (n) =>
      `UZGO Go: ${n} — afsuski, boʻsh haydovchi topilmadi. Onlayn toʻlov boʻlsa, pul qaytariladi.`,
    ru: (n) =>
      `UZGO Go: ${n} — к сожалению, свободный водитель не найден. Онлайн-оплата будет возвращена.`,
  },
};
/** Rides move fast: push for everything, SMS only when nobody came. */
const RIDER_SMS = new Set<RideStatus>(['NO_DRIVER']);

const DRIVER_OFFER = 'UZGO Go: yaqin atrofda yangi buyurtma. / Новый заказ рядом.';
const DRIVER_CANCELLED = 'UZGO Go: yoʻlovchi safarni bekor qildi. / Пассажир отменил поездку.';

/**
 * Rider: their ride changed. `cancelledByRider` skips the rider's own cancel
 * and tells the driver instead (when one had taken the ride).
 */
export async function notifyRideStatus(
  tx: Tx,
  rideId: string,
  to: RideStatus,
  options: { cancelledByRider?: boolean; driverId?: string | null } = {},
) {
  const ride = await tx.ride.findUniqueOrThrow({
    where: { id: rideId },
    select: {
      orderId: true,
      order: { select: { number: true } },
      rider: { select: { id: true, phone: true, locale: true } },
    },
  });
  const rows: Row[] = [];
  if (options.cancelledByRider) {
    const driverId = options.driverId;
    if (driverId && (await withPushDevices(tx, [driverId])).has(driverId)) {
      rows.push({
        channel: 'PUSH',
        recipient: driverId,
        text: DRIVER_CANCELLED,
        template: 'driver.ride_cancelled',
        orderId: ride.orderId,
        data: { type: 'driver' },
      });
    }
    await enqueue(tx, rows);
    return;
  }
  const template = RIDER[to];
  if (!template) return;
  const number = ride.order.number;
  const text = template[localeOf(ride.rider.locale)](number);
  const name = `ride.${to.toLowerCase()}`;
  if (RIDER_SMS.has(to)) {
    rows.push({
      channel: 'SMS',
      recipient: ride.rider.phone,
      text,
      template: name,
      orderId: ride.orderId,
    });
  }
  if ((await withPushDevices(tx, [ride.rider.id])).has(ride.rider.id)) {
    rows.push({
      channel: 'PUSH',
      recipient: ride.rider.id,
      text: pushText(text),
      template: name,
      orderId: ride.orderId,
      data: { type: 'ride', number },
    });
  }
  await enqueue(tx, rows);
}

/**
 * New ride request (ADR 0025): push to online, active drivers of a class
 * that may serve it, whose last position is within `radiusM` of the pickup.
 * No personal data in the text.
 */
export async function notifyDriverOffer(tx: Tx, rideId: string, radiusM: number) {
  const ride = await tx.ride.findUniqueOrThrow({
    where: { id: rideId },
    select: { orderId: true, riderId: true, rideClass: true, pickupLat: true, pickupLng: true },
  });
  const dLat = radiusM / 111_000;
  const dLng = radiusM / (111_000 * Math.cos((ride.pickupLat * Math.PI) / 180));
  const drivers = await tx.driverProfile.findMany({
    where: {
      status: 'ACTIVE',
      online: true,
      userId: { not: ride.riderId },
      // Comfort cars also serve economy rides.
      rideClass: ride.rideClass === 'COMFORT' ? 'COMFORT' : { in: ['ECONOMY', 'COMFORT'] },
      lastLat: { gte: ride.pickupLat - dLat, lte: ride.pickupLat + dLat },
      lastLng: { gte: ride.pickupLng - dLng, lte: ride.pickupLng + dLng },
      lastSeenAt: { gte: new Date(Date.now() - 15 * 60_000) },
    },
    take: 50,
    select: { userId: true },
  });
  const pushUsers = await withPushDevices(
    tx,
    drivers.map((d) => d.userId),
  );
  await enqueue(
    tx,
    [...pushUsers].map((userId) => ({
      channel: 'PUSH' as const,
      recipient: userId,
      text: DRIVER_OFFER,
      template: 'driver.offer',
      orderId: ride.orderId,
      data: { type: 'driver' as const },
    })),
  );
}
