import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, orderResponseSchema, sellerShipmentListSchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, randomIp, TEST_ORIGIN } from './app.js';
import { createProduct, createStore, retireTestStores } from './fixtures.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const DAY = 24 * 60 * 60 * 1000;

describe('returns: reason, window and decision note (ADR 0023)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let districtId = '';
  const http = () => request(app.getHttpServer());
  const post = (path: string, cookie: string, body: object) =>
    http()
      .post(`/api/v1${path}`)
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .set('X-Forwarded-For', randomIp())
      .send(body);

  /** A delivered cash order of one item. */
  async function delivered() {
    const owner = await login(app);
    const store = await createStore(prisma, { ownerId: owner.userId });
    const product = await createProduct(prisma, {
      storeId: store.id,
      variants: [{ priceTiyin: 1_000_00n, stock: 5 }],
    });
    const variantId = product.variants[0]?.id ?? '';
    const customer = await login(app);
    await post('/cart/items', customer.cookie, { variantId, quantity: 1 }).expect(201);
    const res = await http()
      .post('/api/v1/checkout')
      .set('Cookie', customer.cookie)
      .set('Origin', TEST_ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({
        recipientName: 'Ali Valiyev',
        recipientPhone: '+998901234567',
        districtId,
        addressLine: 'Alpomish koʻchasi, 1',
        paymentMethod: 'CASH_ON_DELIVERY',
        expectedTotalTiyin: '100000',
      })
      .expect(201);
    const { order } = orderResponseSchema.parse(res.body);
    const shipmentId = order.sellerOrders[0]?.id ?? '';
    for (const to of ['ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED']) {
      await post(`/seller/seller-orders/${shipmentId}/transition`, owner.cookie, { to }).expect(
        204,
      );
    }
    return {
      owner,
      customer,
      number: order.number,
      shipmentId,
      variantId,
      customerPath: `/orders/${order.number}/seller-orders/${shipmentId}/transition`,
      sellerPath: `/seller/seller-orders/${shipmentId}/transition`,
    };
  }

  const view = async (cookie: string, number: string) =>
    orderResponseSchema.parse(
      (await http().get(`/api/v1/orders/${number}`).set('Cookie', cookie).expect(200)).body,
    ).order.sellerOrders[0];

  beforeAll(async () => {
    app = await createTestApp({ env: { RETURN_WINDOW_DAYS: '7', PAYOUT_HOLD_DAYS: '10' } });
    prisma = app.get(PrismaService);
    districtId = (await prisma.district.findUniqueOrThrow({ where: { slug: 'termiz_city' } })).id;
  });

  afterAll(async () => {
    await retireTestStores(prisma);
    await app.close();
  });

  it('records the delivery time and shows the return deadline', async () => {
    const s = await delivered();
    const shipment = await view(s.customer.cookie, s.number);
    expect(shipment?.deliveredAt).not.toBeNull();
    const until = new Date(shipment?.returnUntil ?? 0).getTime();
    const deliveredAt = new Date(shipment?.deliveredAt ?? 0).getTime();
    expect(until - deliveredAt).toBe(7 * DAY);
    expect(shipment?.allowedTransitions).toEqual(['RETURN_REQUESTED']);
    expect(shipment?.returnRequest).toBeNull();
  });

  it('needs a reason and a comment, and the seller sees them', async () => {
    const s = await delivered();
    const missing = await post(s.customerPath, s.customer.cookie, {
      to: 'RETURN_REQUESTED',
    }).expect(400);
    expect(errorCode(missing.body)).toBe('RETURN_REASON_REQUIRED');
    await post(s.customerPath, s.customer.cookie, {
      to: 'RETURN_REQUESTED',
      returnReason: 'BROKEN',
      returnComment: 'Ishlamayapti',
    }).expect(400);

    await post(s.customerPath, s.customer.cookie, {
      to: 'RETURN_REQUESTED',
      returnReason: 'WRONG_ITEM',
      returnComment: '  Boshqa rang keldi  ',
    }).expect(200);
    const shipment = await view(s.customer.cookie, s.number);
    expect(shipment?.status).toBe('RETURN_REQUESTED');
    expect(shipment?.returnRequest).toEqual({ reason: 'WRONG_ITEM', comment: 'Boshqa rang keldi' });

    const seller = sellerShipmentListSchema
      .parse(
        (await http().get('/api/v1/seller/orders').set('Cookie', s.owner.cookie).expect(200)).body,
      )
      .items.find((i) => i.id === s.shipmentId);
    expect(seller?.returnRequest?.reason).toBe('WRONG_ITEM');
    expect(seller?.allowedTransitions).toEqual(['RETURNED', 'RETURN_REJECTED']);
  });

  it('requires a decision note to reject, and shows it to the customer', async () => {
    const s = await delivered();
    await post(s.customerPath, s.customer.cookie, {
      to: 'RETURN_REQUESTED',
      returnReason: 'CHANGED_MIND',
      returnComment: 'Kerak boʻlmay qoldi',
    }).expect(200);
    const noNote = await post(s.sellerPath, s.owner.cookie, { to: 'RETURN_REJECTED' }).expect(400);
    expect(errorCode(noNote.body)).toBe('DECISION_NOTE_REQUIRED');
    await post(s.sellerPath, s.owner.cookie, {
      to: 'RETURN_REJECTED',
      reason: 'Qadoq ochilgan, gigiyena mahsuloti',
    }).expect(204);
    const shipment = await view(s.customer.cookie, s.number);
    expect(shipment?.status).toBe('RETURN_REJECTED');
    expect(shipment?.returnDecisionNote).toBe('Qadoq ochilgan, gigiyena mahsuloti');
    expect(shipment?.allowedTransitions).toEqual([]);
  });

  it('closes the window after RETURN_WINDOW_DAYS', async () => {
    const s = await delivered();
    await prisma.sellerOrder.update({
      where: { id: s.shipmentId },
      data: { deliveredAt: new Date(Date.now() - 7 * DAY - 60_000) },
    });
    const shipment = await view(s.customer.cookie, s.number);
    expect(shipment?.allowedTransitions).toEqual([]);
    const late = await post(s.customerPath, s.customer.cookie, {
      to: 'RETURN_REQUESTED',
      returnReason: 'DEFECTIVE',
      returnComment: 'Ekran ishlamayapti',
    }).expect(409);
    expect(errorCode(late.body)).toBe('RETURN_WINDOW_CLOSED');
    // Accepted returns put the goods back in stock (unchanged behaviour).
    const fresh = await delivered();
    await post(fresh.customerPath, fresh.customer.cookie, {
      to: 'RETURN_REQUESTED',
      returnReason: 'DEFECTIVE',
      returnComment: 'Ekran ishlamayapti',
    }).expect(200);
    await post(fresh.sellerPath, fresh.owner.cookie, { to: 'RETURNED' }).expect(204);
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: fresh.variantId },
    });
    expect(variant.stock).toBe(5);
  });
});
