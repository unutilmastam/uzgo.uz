# 0024 — UZGO Food: restaurants, menus, couriers

- Status: Accepted (owner answers, 2026-10-16)
- Builds on: 0006 (order split), 0015 (checkout), 0017 (payments), 0018 (ledger),
  0019 (notifications), 0022 (mobile)

## Owner decisions

| Question             | Answer                                                           |
| -------------------- | ---------------------------------------------------------------- |
| Who delivers         | Both: each restaurant delivers itself **or** uses UZGO couriers  |
| Where                | All of Uzbekistan (any district; restaurants added by staff)     |
| Payment              | Cash, Payme, Click (the existing providers)                      |
| How restaurants join | Only UZGO staff add them (no self-service application)           |
| Maps / addresses     | OpenStreetMap (behind an adapter, replaceable by Yandex later)   |
| Courier app          | A courier mode inside the UZGO mobile app                        |
| Assigning couriers   | Couriers take offers themselves (first to accept gets the order) |

## Decision

1. **Modular monolith**: a `food` module in the API. Food reuses what money
   needs to be right once: `Order` (with `kind = FOOD`), payments (Payme,
   Click, refunds), the ledger, notifications and the store team model.
   - A restaurant is a `Store` with `kind = RESTAURANT` plus a
     `RestaurantProfile` (address, coordinates, delivery mode and radius,
     opening hours in Tashkent time, preparation time, minimum order, pause).
     Restaurants never appear in the marketplace and cannot list products.
   - Menu: `FoodMenuCategory` and `FoodMenuItem` (uz/ru name, price in
     tiyin, photo, availability, IKPU/package code for fiscal receipts).
     Staff create restaurants and menus; the restaurant team accepts orders,
     marks dishes unavailable and pauses intake.
   - A food order is one `Order` with one `SellerOrder` (the restaurant) whose
     lines point to menu items (`OrderItem.menuItemId`; marketplace lines keep
     `variantId`; a CHECK allows exactly one kind). No stock: dishes are
     available or not. No basket table: the app sends the dishes at checkout
     and the server prices them (`expectedTotalTiyin`, idempotency key).
   - Promo codes stay marketplace-only for now.
2. **Statuses** reuse the shipment states with a food transition table:
   NEW (placed) → ACCEPTED (cooking) → PACKED (ready) → HANDED_TO_DELIVERY
   (on the way) → DELIVERED, plus cancellations and DELIVERY_FAILED. No
   returns (problems go to support). Restaurants that do not accept within
   `FOOD_ACCEPT_TIMEOUT_MINUTES` (default 10) are cancelled by the system and
   online payments refunded.
3. **Delivery modes** (snapshot on the order):
   - SELF: the restaurant's fixed delivery fee; it delivers and moves the
     order to delivered (as a marketplace seller does).
   - UZGO: fee = base + per-km tariff on the straight-line distance (× 1.3
     road factor), rounded up to 100 soʻm; env-configured
     (`FOOD_COURIER_BASE_TIYIN`, `FOOD_COURIER_PER_KM_TIYIN`). The courier
     earns the whole fee.
   - Every order needs delivery coordinates (phone location or geocoded
     address) inside the restaurant's radius.
4. **Couriers**: users with role `COURIER` and a `CourierProfile` (status,
   vehicle, online flag, last position). Staff add and suspend couriers.
   Online couriers see offers (UZGO-mode orders being cooked or ready, no
   courier yet, within `FOOD_OFFER_RADIUS_KM` of their last position); taking
   one is a conditional update, so only one courier can win. The courier
   picks the order up (ready → on the way) and delivers it. While delivering
   the app sends the position (≤ every 10 s); the customer sees the courier's
   last position for their own active order only. No location history is kept.
5. **Money** (ledger account `COURIER_PAYABLE` per courier):
   - Online, UZGO delivery: prepayment (items + fee) → restaurant payable
     (items − commission) + revenue (commission) + courier payable (fee).
   - Cash, UZGO delivery: the courier collected items + fee and keeps the fee,
     so they owe UZGO the items amount: courier +items, restaurant
     −(items − commission), revenue −commission.
   - SELF delivery: exactly the marketplace postings (fee belongs to the
     restaurant).
   - Staff record courier settlements (cash handed in, or payout to the
     courier) — audited, posted against `PROVIDER_CLEARING`.
6. **Maps**: `GeocodingProvider` adapter; `NominatimGeocoder` (OpenStreetMap)
   respects the public usage policy (≤ 1 request/s, identifying User-Agent,
   results cached) and `FakeGeocoder` in tests. No map tiles are embedded yet
   (the public OSM tile servers forbid heavy commercial use): the customer gets
   distance, ETA and an "open in map" link. A tile provider or Yandex is an
   owner decision before scale.

## Consequences

- One payments/refunds/ledger code path for both kinds of orders.
- OpenStreetMap address quality in smaller towns is uneven; the phone's
  location is offered first. Self-hosted Nominatim or Yandex later via the adapter.
- Straight-line distance underestimates real routes; the road factor and
  tariffs are env-configurable and shown to the customer before ordering.
- Legal (owner + lawyer): food safety responsibility of restaurants, courier
  contracts (self-employed status), fiscal receipts for restaurant sales.
