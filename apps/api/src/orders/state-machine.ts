import type {
  OrderActor,
  OrderKind,
  OrderStatus,
  SellerOrderStatus,
} from '../generated/prisma/enums.js';

type Transition = { to: SellerOrderStatus; actors: readonly OrderActor[] };

const STAFF = ['SELLER', 'ADMIN'] as const;

/**
 * Explicit SellerOrder transition table (SPEC §10, docs/DATABASE.md).
 * Anything not listed here is rejected.
 */
export const SELLER_ORDER_TRANSITIONS: Readonly<Record<SellerOrderStatus, readonly Transition[]>> =
  {
    // Online orders wait here until paid. Unpaid orders are cancelled only as a
    // whole (payments module), never one shipment at a time: the provider
    // collects the full order amount.
    PENDING_PAYMENT: [
      { to: 'NEW', actors: ['SYSTEM'] },
      { to: 'CANCELLED_BY_CUSTOMER', actors: ['SYSTEM'] },
    ],
    // SYSTEM cancellations below: the payment provider returned the whole
    // payment (e.g. Payme CancelTransaction on a performed transaction).
    NEW: [
      { to: 'ACCEPTED', actors: STAFF },
      { to: 'CANCELLED_BY_SELLER', actors: STAFF },
      { to: 'CANCELLED_BY_CUSTOMER', actors: ['CUSTOMER', 'SYSTEM'] },
    ],
    ACCEPTED: [
      { to: 'PACKED', actors: STAFF },
      { to: 'CANCELLED_BY_SELLER', actors: STAFF },
      { to: 'CANCELLED_BY_CUSTOMER', actors: ['SYSTEM'] },
    ],
    PACKED: [
      { to: 'HANDED_TO_DELIVERY', actors: STAFF },
      { to: 'CANCELLED_BY_CUSTOMER', actors: ['SYSTEM'] },
    ],
    HANDED_TO_DELIVERY: [
      { to: 'DELIVERED', actors: [...STAFF, 'SYSTEM'] },
      { to: 'DELIVERY_FAILED', actors: [...STAFF, 'SYSTEM'] },
    ],
    DELIVERED: [{ to: 'RETURN_REQUESTED', actors: ['CUSTOMER'] }],
    RETURN_REQUESTED: [
      { to: 'RETURNED', actors: STAFF },
      { to: 'RETURN_REJECTED', actors: STAFF },
    ],
    DELIVERY_FAILED: [],
    CANCELLED_BY_SELLER: [],
    CANCELLED_BY_CUSTOMER: [],
    RETURNED: [],
    RETURN_REJECTED: [],
  };

/**
 * Food orders (Phase 9b, ADR 0024): NEW = placed, ACCEPTED = cooking,
 * PACKED = ready, HANDED_TO_DELIVERY = on the way. No returns. Who may hand
 * over and deliver also depends on the delivery mode (checked in the
 * transition: the restaurant for SELF, the assigned courier for UZGO).
 */
export const FOOD_ORDER_TRANSITIONS: Readonly<Record<SellerOrderStatus, readonly Transition[]>> = {
  PENDING_PAYMENT: [
    { to: 'NEW', actors: ['SYSTEM'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['SYSTEM'] },
  ],
  NEW: [
    { to: 'ACCEPTED', actors: STAFF },
    { to: 'CANCELLED_BY_SELLER', actors: [...STAFF, 'SYSTEM'] },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['CUSTOMER', 'SYSTEM'] },
  ],
  ACCEPTED: [
    { to: 'PACKED', actors: STAFF },
    { to: 'CANCELLED_BY_SELLER', actors: STAFF },
    { to: 'CANCELLED_BY_CUSTOMER', actors: ['SYSTEM'] },
  ],
  PACKED: [
    { to: 'HANDED_TO_DELIVERY', actors: [...STAFF, 'COURIER'] },
    { to: 'CANCELLED_BY_SELLER', actors: ['ADMIN'] },
  ],
  HANDED_TO_DELIVERY: [
    { to: 'DELIVERED', actors: [...STAFF, 'COURIER', 'SYSTEM'] },
    { to: 'DELIVERY_FAILED', actors: [...STAFF, 'COURIER', 'SYSTEM'] },
  ],
  DELIVERED: [],
  RETURN_REQUESTED: [],
  DELIVERY_FAILED: [],
  CANCELLED_BY_SELLER: [],
  CANCELLED_BY_CUSTOMER: [],
  RETURNED: [],
  RETURN_REJECTED: [],
};

export function transitionsFor(
  kind: OrderKind,
): Readonly<Record<SellerOrderStatus, readonly Transition[]>> {
  return kind === 'FOOD' ? FOOD_ORDER_TRANSITIONS : SELLER_ORDER_TRANSITIONS;
}

export function canTransition(
  from: SellerOrderStatus,
  to: SellerOrderStatus,
  actor: OrderActor,
  kind: OrderKind = 'MARKET',
): boolean {
  return transitionsFor(kind)[from].some((t) => t.to === to && t.actors.includes(actor));
}

/** Transitions that put the goods back into stock. */
export const RESTOCK_STATUSES: ReadonlySet<SellerOrderStatus> = new Set([
  'CANCELLED_BY_SELLER',
  'CANCELLED_BY_CUSTOMER',
  'DELIVERY_FAILED',
  'RETURNED',
]);

const CANCELLED: ReadonlySet<SellerOrderStatus> = new Set([
  'CANCELLED_BY_SELLER',
  'CANCELLED_BY_CUSTOMER',
]);
/** Shipment states that count as "resolved" for the customer order. */
const RESOLVED: ReadonlySet<SellerOrderStatus> = new Set([
  'DELIVERED',
  'DELIVERY_FAILED',
  'CANCELLED_BY_SELLER',
  'CANCELLED_BY_CUSTOMER',
  'RETURN_REQUESTED',
  'RETURNED',
  'RETURN_REJECTED',
]);

/**
 * Customer order status derived from its shipments:
 * all cancelled → CANCELLED; all resolved → COMPLETED; any accepted or later → CONFIRMED.
 */
export function deriveOrderStatus(statuses: readonly SellerOrderStatus[]): OrderStatus {
  if (statuses.length === 0) return 'CREATED';
  if (statuses.some((s) => s === 'PENDING_PAYMENT')) return 'AWAITING_PAYMENT';
  if (statuses.every((s) => CANCELLED.has(s))) return 'CANCELLED';
  if (statuses.every((s) => RESOLVED.has(s))) return 'COMPLETED';
  if (statuses.some((s) => s !== 'NEW' && s !== 'PENDING_PAYMENT' && !CANCELLED.has(s))) {
    return 'CONFIRMED';
  }
  return 'CREATED';
}
