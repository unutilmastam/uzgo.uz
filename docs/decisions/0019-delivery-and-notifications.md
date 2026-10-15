# 0019 — Delivery tariffs, pickup points, tracking and notifications (Phase 6)

- Status: Accepted
- Date: 2026-10-15
- Builds on: 0006 (one shipment per store), 0015 (checkout), 0017/0018

## Decision

- **Tariff per district (`DeliveryZone`)**, charged **per shipment** (each store
  ships separately): fee in tiyin, optional free-from threshold on the
  shipment's items total, ETA in days. No zone = the price is agreed with the
  seller (fee 0, as in Phase 4); an inactive zone = no courier delivery there
  (`DELIVERY_UNAVAILABLE`). The delivery fee belongs to the seller (they
  deliver); commission is charged on items only.
- **Pickup points** per district; pickup is free; the point must be active and
  in the chosen district. The order keeps a snapshot of the point.
- **Quote endpoint** applies exactly the checkout rules to the caller's cart;
  checkout still recomputes everything and answers `PRICE_CHANGED` if the
  customer saw another total.
- **Tracking**: sellers record carrier + tracking code once accepted; the
  customer sees it with the shipment's status history (from `OrderEvent`).
  External courier/map APIs are a later decision (no provider chosen yet).
- **Notifications (outbox)**: SMS and Telegram messages are written in the same
  transaction as the event (new shipment for sellers, payment received,
  accepted / handed over / delivered / cancelled / failed for customers) and
  sent by a background job with retries (1 m, 5 m, 30 m, 2 h; then FAILED).
  Rows are claimed with `FOR UPDATE SKIP LOCKED`. Texts carry no address or
  name. SMS uses the existing `SmsProvider` (a real provider is still an open
  owner decision); Telegram uses the Bot API when `TELEGRAM_BOT_TOKEN` is set,
  otherwise it only logs (development) or records in memory (tests). Store
  owners set the store's chat id; a bot flow that shows the chat id comes with
  the bot itself.

## Consequences

A provider outage delays messages but never blocks or loses an order. Delivery
pricing becomes data the owner manages in the admin panel.
