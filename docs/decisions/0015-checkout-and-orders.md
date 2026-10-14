# 0015 — Checkout and orders (Phase 4, cash on delivery)

- Status: Accepted
- Date: 2026-10-14
- Builds on: 0005 (money in tiyin), 0006 (Order + SellerOrder)

## Decision

- **Single transaction per checkout:** idempotency key insert → cart lines →
  validation → server totals vs. `expectedTotalTiyin` → conditional stock
  decrements (fixed order) → `Order` + one `SellerOrder` per store + item
  snapshots + `OrderEvent`s → cart cleared → stored response.
- **Stock for cash on delivery** is decremented at checkout and restored on
  cancellation, failed delivery or return. Timed reservations
  (`StockReservation`) come with unpaid online orders in Phase 6.
- **Order numbers:** `UZ-<year in Asia/Tashkent>-<global sequence, 6+ digits>`
  from a PostgreSQL sequence; shipments add `-1`, `-2`, …. The sequence does not
  reset each year (numbers stay unique and simple).
- **Delivery fee** is 0 and shown as "agreed with the seller" until delivery
  zones exist (Phase 6).
- **State machine** as an explicit table with actors; the customer order status
  is derived from shipments.
- **Seller endpoints** exist now (list + transitions) so isolation and the
  state machine are tested; the seller panel UI is Phase 5.

## Consequences

The checkout transaction touches many rows; it uses row-level locking only on
the variants it buys, so unrelated orders do not block each other.
