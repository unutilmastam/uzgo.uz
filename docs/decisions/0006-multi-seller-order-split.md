# 0006 — Multi-seller order split (Order + SellerOrder)

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md §10

## Context

One cart can contain items from several stores; each seller must fulfil and see only its own part, and payouts are per seller.

## Decision

Checkout creates one customer-facing Order and one SellerOrder (shipment) per store. OrderItems belong to a SellerOrder and snapshot title, variant, unit price, quantity and fiscal codes. Each level has its own state machine; transitions write OrderEvent rows.

## Consequences

Clear seller isolation and per-seller fulfilment and ledger. Order status is derived from its SellerOrders, which needs careful tests.
