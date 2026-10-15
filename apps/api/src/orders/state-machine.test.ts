import { describe, expect, it } from 'vitest';
import type { SellerOrderStatus } from '../generated/prisma/enums.js';
import { canTransition, deriveOrderStatus, SELLER_ORDER_TRANSITIONS } from './state-machine.js';

describe('seller order state machine', () => {
  it('allows the normal fulfilment path for sellers', () => {
    const path: SellerOrderStatus[] = [
      'NEW',
      'ACCEPTED',
      'PACKED',
      'HANDED_TO_DELIVERY',
      'DELIVERED',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(
        canTransition(path[i] as SellerOrderStatus, path[i + 1] as SellerOrderStatus, 'SELLER'),
      ).toBe(true);
    }
  });

  it('rejects skipping steps and moving backwards', () => {
    expect(canTransition('NEW', 'DELIVERED', 'SELLER')).toBe(false);
    expect(canTransition('PACKED', 'NEW', 'SELLER')).toBe(false);
    expect(canTransition('DELIVERED', 'ACCEPTED', 'ADMIN')).toBe(false);
  });

  it('separates customer and seller actions', () => {
    expect(canTransition('NEW', 'CANCELLED_BY_CUSTOMER', 'CUSTOMER')).toBe(true);
    expect(canTransition('NEW', 'ACCEPTED', 'CUSTOMER')).toBe(false);
    expect(canTransition('ACCEPTED', 'CANCELLED_BY_CUSTOMER', 'CUSTOMER')).toBe(false);
    expect(canTransition('NEW', 'CANCELLED_BY_CUSTOMER', 'SELLER')).toBe(false);
    expect(canTransition('DELIVERED', 'RETURN_REQUESTED', 'CUSTOMER')).toBe(true);
    expect(canTransition('DELIVERED', 'RETURN_REQUESTED', 'SELLER')).toBe(false);
  });

  it('has no way out of final states', () => {
    for (const status of [
      'CANCELLED_BY_SELLER',
      'CANCELLED_BY_CUSTOMER',
      'DELIVERY_FAILED',
      'RETURNED',
      'RETURN_REJECTED',
    ] as const) {
      expect(SELLER_ORDER_TRANSITIONS[status]).toEqual([]);
    }
  });
});

describe('deriveOrderStatus', () => {
  it('derives the customer order status from shipments', () => {
    expect(deriveOrderStatus(['NEW', 'NEW'])).toBe('CREATED');
    expect(deriveOrderStatus(['ACCEPTED', 'NEW'])).toBe('CONFIRMED');
    expect(deriveOrderStatus(['CANCELLED_BY_SELLER', 'NEW'])).toBe('CREATED');
    expect(deriveOrderStatus(['CANCELLED_BY_SELLER', 'CANCELLED_BY_CUSTOMER'])).toBe('CANCELLED');
    expect(deriveOrderStatus(['DELIVERED', 'CANCELLED_BY_SELLER'])).toBe('COMPLETED');
    expect(deriveOrderStatus(['DELIVERED', 'PACKED'])).toBe('CONFIRMED');
  });
});

describe('online payment states', () => {
  it('only the system moves unpaid shipments (whole-order payment and cancellation)', () => {
    expect(canTransition('PENDING_PAYMENT', 'NEW', 'SYSTEM')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'NEW', 'CUSTOMER')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'NEW', 'SELLER')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'NEW', 'ADMIN')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'ACCEPTED', 'SELLER')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'CANCELLED_BY_CUSTOMER', 'CUSTOMER')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'CANCELLED_BY_CUSTOMER', 'SYSTEM')).toBe(true);
  });

  it('derives AWAITING_PAYMENT while unpaid', () => {
    expect(deriveOrderStatus(['PENDING_PAYMENT', 'PENDING_PAYMENT'])).toBe('AWAITING_PAYMENT');
    expect(deriveOrderStatus(['NEW', 'NEW'])).toBe('CREATED');
    expect(deriveOrderStatus(['CANCELLED_BY_CUSTOMER'])).toBe('CANCELLED');
  });
});
