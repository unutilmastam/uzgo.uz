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

async function enqueue(
  tx: Tx,
  rows: {
    channel: 'SMS' | 'TELEGRAM';
    recipient: string;
    text: string;
    template: string;
    orderId: string;
  }[],
) {
  if (rows.length > 0) await tx.notification.createMany({ data: rows });
}

/** Customer: shipment status changes they care about. */
export async function notifyShipmentStatus(tx: Tx, sellerOrderId: string, to: SellerOrderStatus) {
  const template = CUSTOMER[to];
  if (!template && to !== 'NEW') return;
  const shipment = await tx.sellerOrder.findUniqueOrThrow({
    where: { id: sellerOrderId },
    select: {
      number: true,
      orderId: true,
      order: { select: { user: { select: { phone: true, locale: true } } } },
    },
  });
  if (to === 'NEW') {
    await notifySellers(tx, [sellerOrderId]);
    return;
  }
  if (!template) return;
  const user = shipment.order.user;
  await enqueue(tx, [
    {
      channel: 'SMS',
      recipient: user.phone,
      text: template[localeOf(user.locale)](shipment.number),
      template: `shipment.${to.toLowerCase()}`,
      orderId: shipment.orderId,
    },
  ]);
}

/** Customer: online payment received. */
export async function notifyOrderPaid(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { number: true, user: { select: { phone: true, locale: true } } },
  });
  await enqueue(tx, [
    {
      channel: 'SMS',
      recipient: order.user.phone,
      text: PAID[localeOf(order.user.locale)](order.number),
      template: 'order.paid',
      orderId,
    },
  ]);
}

/** Store owners (SMS) and the store's Telegram chat: a new shipment to confirm. */
export async function notifySellers(tx: Tx, sellerOrderIds: string[]) {
  const shipments = await tx.sellerOrder.findMany({
    where: { id: { in: sellerOrderIds } },
    select: {
      number: true,
      orderId: true,
      items: { select: { quantity: true } },
      store: {
        select: {
          telegramChatId: true,
          members: { where: { role: 'OWNER' }, select: { user: { select: { phone: true } } } },
        },
      },
    },
  });
  const rows = shipments.flatMap((s) => {
    const text = sellerNew(
      s.number,
      s.items.reduce((n, i) => n + i.quantity, 0),
    );
    return [
      ...s.store.members.map((m) => ({
        channel: 'SMS' as const,
        recipient: m.user.phone,
        text,
        template: 'seller.new_order',
        orderId: s.orderId,
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
