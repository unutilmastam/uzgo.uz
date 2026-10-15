import type { Prisma } from '../generated/prisma/client.js';
import type { SellerOrderStatus } from '../generated/prisma/enums.js';

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
  data?: { type: 'order'; number: string } | { type: 'shipment'; storeId: string };
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
  const template = CUSTOMER[to];
  if (!template && to !== 'NEW') return;
  const shipment = await tx.sellerOrder.findUniqueOrThrow({
    where: { id: sellerOrderId },
    select: {
      number: true,
      orderId: true,
      order: {
        select: { number: true, user: { select: { id: true, phone: true, locale: true } } },
      },
    },
  });
  if (to === 'NEW') {
    await notifySellers(tx, [sellerOrderId]);
    return;
  }
  if (!template) return;
  const user = shipment.order.user;
  const text = template[localeOf(user.locale)](shipment.number);
  const name = `shipment.${to.toLowerCase()}`;
  const rows: Row[] = [
    { channel: 'SMS', recipient: user.phone, text, template: name, orderId: shipment.orderId },
  ];
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
