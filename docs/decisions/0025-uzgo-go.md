# 0025 — UZGO Go: ride-hailing (drivers, rides)

- Status: Accepted (owner answers, 2026-10-16)
- Builds on: 0017 (payments), 0018 (ledger), 0019 (notifications),
  0022 (mobile), 0024 (Food: geo, geocoder, courier offers)

## Owner decisions

| Question          | Answer                                                                |
| ----------------- | --------------------------------------------------------------------- |
| Who drives        | Anyone may apply in the app; UZGO staff check and approve each driver |
| Price             | Fixed price shown before ordering (server-calculated from the route)  |
| Payment           | Cash, Payme, Click                                                    |
| Assigning drivers | Drivers take requests themselves (first to accept gets the ride)      |
| Maps / area       | OpenStreetMap (same adapter as Food), all of Uzbekistan               |

## Decision

1. **Modular monolith**: a `rides` module in the API. A ride reuses `Order`
   (`kind = RIDE`, no shipments) so the existing Payme/Click adapters,
   payment window, refunds, ledger and notification outbox work unchanged.
   Ride data lives in `Ride` (1:1 with the order): class, pickup and drop-off
   points and labels, distance, price, commission, driver, status and times.
   The order number (`UZ-YYYY-NNNNNN`) is the ride's public id.
2. **Drivers** apply themselves (`DriverProfile`: name, driver licence number,
   car make/model/colour/year, plate, optional taxi permit / self-employed
   number and TIN, consent to the driver terms). Staff approve (role
   `DRIVER`), reject with a note (the driver may correct and re-apply) or
   suspend. Only ACTIVE drivers go online. No document photos are stored:
   staff check the originals in person or by video call (less personal data
   to protect). Taxi licensing rules must be confirmed by a lawyer before
   launch — the permit field is there so staff can record it.
3. **Price** (fixed, decided by the server): `base + perKm × road km` per
   class (`ECONOMY`, `COMFORT`), road km = straight-line distance × 1.3,
   rounded up to 500 soʻm. Tariffs and the UZGO commission
   (`RIDE_COMMISSION_BP`) are env settings. The client sends
   `expectedPriceTiyin`; a changed price is refused (`PRICE_CHANGED`).
   Trips longer than `RIDE_MAX_KM` are refused.
4. **Statuses**: AWAITING_PAYMENT (online, not paid) → SEARCHING → ACCEPTED
   (driver on the way) → ARRIVED → IN_PROGRESS → COMPLETED. CANCELLED (by the
   rider before the trip starts, by the driver at pickup when the rider does
   not come, by staff, or unpaid) and NO_DRIVER (nobody accepted within
   `RIDE_SEARCH_TIMEOUT_MINUTES`). A driver may give an accepted ride back
   (→ SEARCHING). One active ride per driver. Accepting is a conditional
   update: two drivers can never take the same ride. The order status
   follows the ride.
5. **Money** (ledger, new account `DRIVER_PAYABLE` per driver):
   - Online: capture as usual (`PROVIDER_CLEARING` / `CUSTOMER_PREPAYMENTS`);
     on completion the prepayment moves to the driver (price − commission)
     and to `PLATFORM_REVENUE` (commission). A cancelled or unserved paid
     ride creates a full refund (no cancellation fee for now).
   - Cash: on completion the driver owes UZGO the commission.
   - `DriverSettlement` records cash handed in and payouts (append-only,
     never more than the balance), like courier settlements.
   - Payme/Click fiscal receipts need `RIDE_MXIK_CODE` and
     `RIDE_PACKAGE_CODE` (one "taxi service" line); without them only cash is
     offered. VAT and on-behalf-of (driver TIN) rules: confirm with the
     accountant and Payme/Click before launch.
6. **Privacy**: offers show pickup and drop-off area, distance and price
   only; the rider's name and phone appear to the driver after accepting.
   The rider sees the driver's first name, phone, car, plate and live
   position only while the ride is active. Only the driver's last position
   is stored (no trail). Location permission is foreground only.
7. **Notifications**: new requests → push to online drivers within
   `RIDE_OFFER_RADIUS_KM`; rider → push on accepted, arrived, completed,
   cancelled; SMS only when no driver was found (with refund info).
8. **Clients**: web — request a ride, live ride page, ride history, driver
   application and its status, admin drivers and rides; mobile — the same
   plus the driver mode (online, requests nearby, take, arrived, start,
   complete). The driver mode is app-only, like the courier mode.

## Consequences

- No surge pricing, ratings, scheduled rides, shared rides or cancellation
  fees yet; each can be added on top of the same tables.
- Street-routing distance is approximated (× 1.3). A routing service (OSRM
  or a commercial one) can replace it behind the geo helpers later.
- Riders choose the pickup district (needed by the order record and for
  staff reports); it is prefilled from the profile.
