import type { OrderActor, OrderStatus, SellerOrderStatus } from '../generated/prisma/enums.js';

type Transition = { to: SellerOrderStatus; actors: readonly OrderActor[] };

const STAFF = ['SELLER', 'ADMIN'] as const;

/**
 * Explicit SellerOrder transition table (SPEC §10, docs/DATABASE.md).
 * Anything not listed here is rejected.
 */
export const SELLER_ORDER_TRANSITIONS: Readonly<Record<SellerOrderStatus, readonly Transition[]>> =
  {
    NEW: [
      { to: 'ACCEPTED', actors: STAFF },
      { to: 'CANCELLED_BY_SELLER', actors: STAFF },
      { to: 'CANCELLED_BY_CUSTOMER', actors: ['CUSTOMER'] },
    ],
    ACCEPTED: [
      { to: 'PACKED', actors: STAFF },
      { to: 'CANCELLED_BY_SELLER', actors: STAFF },
    ],
    PACKED: [{ to: 'HANDED_TO_DELIVERY', actors: STAFF }],
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

export function canTransition(
  from: SellerOrderStatus,
  to: SellerOrderStatus,
  actor: OrderActor,
): boolean {
  return SELLER_ORDER_TRANSITIONS[from].some((t) => t.to === to && t.actors.includes(actor));
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
  if (statuses.every((s) => CANCELLED.has(s))) return 'CANCELLED';
  if (statuses.every((s) => RESOLVED.has(s))) return 'COMPLETED';
  if (statuses.some((s) => s !== 'NEW' && !CANCELLED.has(s))) return 'CONFIRMED';
  return 'CREATED';
}
