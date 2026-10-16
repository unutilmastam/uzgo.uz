# API conventions

NestJS REST API. Contracts (request/response schemas) are Zod schemas in
`packages/contracts`, shared with the web app. OpenAPI is generated from them.

## Base

- Base path: `/api/v1`. Breaking changes → `/api/v2`; additive changes stay in v1.
- JSON only (`application/json; charset=utf-8`), except file uploads (multipart).
- Field names `camelCase`. Resource paths plural, kebab-case: `/api/v1/seller-orders`.
- OpenAPI/Swagger UI at `/api/docs` — disabled in production unless
  `SWAGGER_ENABLED=true`.

## Money, time, ids in payloads

- Money: integer tiyin as a **string** (`"1250000"` = 12 500 soʻm) to keep
  BigInt exact in JavaScript. Field suffix `Tiyin`, e.g. `priceTiyin`.
- Time: ISO 8601 UTC (`2026-10-14T09:30:00.000Z`). The client formats to
  `Asia/Tashkent`.
- IDs: UUID strings.
- Localised content: the API returns the value for the requested locale
  (`Accept-Language: uz|ru` or `?locale=`), falling back to `uz`. Seller/admin
  editing endpoints send and receive the full `{ uz, ru }` object.

## Errors

Every non-2xx response:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [ … ], "requestId": "…" } }
```

| HTTP | code (examples)                                                                  |
| ---- | -------------------------------------------------------------------------------- |
| 400  | `VALIDATION_FAILED` (details = Zod issues: path, message)                        |
| 401  | `UNAUTHENTICATED`                                                                |
| 403  | `FORBIDDEN`                                                                      |
| 404  | `NOT_FOUND`                                                                      |
| 409  | `CONFLICT`, `OUT_OF_STOCK`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_STATE_TRANSITION` |
| 413  | `PAYLOAD_TOO_LARGE`                                                              |
| 422  | `PRICE_CHANGED` (checkout recalculated a different total)                        |
| 429  | `RATE_LIMITED` (with `Retry-After`)                                              |
| 500  | `INTERNAL_ERROR` (no stack trace, no internals)                                  |

`message` is safe to show; the web app maps `code` to a translated UI string.

## Request id

Every request gets `X-Request-Id` (accepted from the trusted proxy if valid,
otherwise generated). It is returned in the response header, in error bodies and
in every log line.

## Authentication

- Session cookie `uzgo_session`: opaque random token, `HttpOnly; Secure;
SameSite=Lax; Path=/`. Only the hash is stored in the DB.
- Endpoints (Phase 3): `POST /auth/otp/request`, `POST /auth/otp/verify`,
  `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`.
- Mobile (Phase 8): same sessions, `Authorization: Bearer <token>`.
- State-changing requests with a cookie must pass the Origin/Referer check.

## Endpoints (Phase 3)

| Method | Path                               | Access             | Notes                                                                      |
| ------ | ---------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| POST   | `/auth/otp/request`                | public             | `{ phone, locale? }` → `{ expiresInSeconds, resendInSeconds }`             |
| POST   | `/auth/otp/verify`                 | public             | `{ phone, code }` → `{ user }` + session cookie                            |
| GET    | `/auth/me`                         | session            | `{ user }`                                                                 |
| POST   | `/auth/logout`                     | session            | 204, clears cookie                                                         |
| POST   | `/auth/logout-all`                 | session            | 204, revokes every session                                                 |
| PATCH  | `/users/me`                        | session            | `{ firstName?, lastName?, districtId?, locale? }`; unknown fields rejected |
| GET    | `/geo/regions`                     | public             | cached 1 h                                                                 |
| GET    | `/geo/regions/:regionId/districts` | public             | cached 1 h                                                                 |
| POST   | `/admin/users/:userId/roles`       | ADMIN, SUPER_ADMIN | `{ role }`, 204                                                            |
| DELETE | `/admin/users/:userId/roles/:role` | ADMIN, SUPER_ADMIN | 204                                                                        |

## Endpoints (Phase 4)

| Method         | Path                                           | Access                      | Notes                                                                                                                                                       |
| -------------- | ---------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | `/catalog/categories`                          | public                      | active tree                                                                                                                                                 |
| GET            | `/catalog/categories/:slug`                    | public                      | breadcrumbs, children, inherited filters                                                                                                                    |
| GET            | `/catalog/products`                            | public                      | `q, category, store, minPrice, maxPrice (soʻm), attr=code:value…, sort, page, pageSize ≤ 48` → `{ items, page, pageSize, total }`; approved + in stock only |
| GET            | `/catalog/products/:slug`                      | public                      | variants with tiyin prices and capped availability                                                                                                          |
| GET            | `/catalog/stores/:slug`                        | public                      | active stores                                                                                                                                               |
| GET            | `/media/*key`                                  | public                      | dev storage only; `nosniff` + sandbox CSP                                                                                                                   |
| GET            | `/cart`                                        | guest or user               | recalculated every time; grouped by store                                                                                                                   |
| POST           | `/cart/items`                                  | guest or user               | `{ variantId, quantity }` (adds)                                                                                                                            |
| PATCH / DELETE | `/cart/items/:variantId`                       | guest or user               | set quantity / remove                                                                                                                                       |
| POST           | `/checkout`                                    | session + `Idempotency-Key` | COD; `{ recipientName, recipientPhone, districtId, addressLine, comment?, paymentMethod, expectedTotalTiyin }` → 201 `{ order }`                            |
| GET            | `/orders`, `/orders/:number`                   | session                     | own orders only (others 404)                                                                                                                                |
| POST           | `/orders/:number/seller-orders/:id/transition` | session (owner)             | `{ to, reason? }` — customer transitions only                                                                                                               |
| GET            | `/seller/orders?storeId=`                      | session (store member)      | 403 for foreign stores                                                                                                                                      |
| POST           | `/seller/seller-orders/:id/transition`         | store member                | 204; 404 for foreign shipments (staff use `/admin/orders`)                                                                                                  |

## Endpoints (Phase 5)

Seller routes need a session and store membership (non-members: 404).
Every `/admin/*` route needs a staff role **and** a TOTP-verified session
(`403 TOTP_REQUIRED` otherwise).

| Method          | Path                                                                                    | Access      | Notes                                                                    |
| --------------- | --------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| GET / POST      | `/auth/totp/status`, `/setup`, `/enable`, `/verify`                                     | staff       | `{ code }`; setup returns the secret once; 5/min                         |
| GET / POST      | `/seller/stores`                                                                        | session     | apply: name, slug, districtId, legalType, legalName, taxId, contactPhone |
| GET             | `/seller/categories/:id/attributes`                                                     | session     | attributes (with value ids) a leaf category allows                       |
| GET / POST      | `/seller/stores/:storeId/products`                                                      | member      | `?status&page`; create draft                                             |
| GET / PATCH     | `/seller/stores/:storeId/products/:id`                                                  | member      | content edits re-queue approved products                                 |
| POST            | `…/products/:id/submit`, `/archive`, `/restore`                                         | member      | submit needs an active store, an image and an active variant             |
| POST / PATCH    | `…/products/:id/variants`, `…/variants/:variantId`                                      | member      | tiyin strings; `stock` or atomic `stockAdjust`                           |
| POST / DELETE   | `…/products/:id/images`, `…/images/:imageId`                                            | member      | multipart field `file`, ≤ 8 MB, re-encoded to WebP                       |
| PUT             | `…/products/:id/images/order`                                                           | member      | `{ ids }` — every image exactly once                                     |
| GET/POST/DELETE | `/seller/stores/:storeId/members[/:userId]`                                             | owner       | add staff by phone (account must exist)                                  |
| GET             | `/admin/stores?status&page`, `/admin/stores/:id`                                        | moderator+  | review queue (oldest first for PENDING)                                  |
| POST            | `/admin/stores/:id/approve`, `/reject`                                                  | moderator+  | reject needs `{ reason }`                                                |
| POST            | `/admin/stores/:id/suspend`, `/reactivate`                                              | admin+      | suspend needs `{ reason }`                                               |
| GET             | `/admin/products?status&page`, `/admin/products/:id`                                    | moderator+  | default status PENDING_REVIEW                                            |
| POST            | `/admin/products/:id/approve`, `/reject`                                                | moderator+  | reject (or take down) needs `{ reason }`, shown to the seller            |
| GET/POST/PATCH  | `/admin/categories[/:id]`, `PUT /admin/categories/:id/attributes`                       | admin+      | cycle and leaf checks; renames reindex search                            |
| GET/POST/PATCH  | `/admin/attributes[/:id[/values[/:valueId]]]`                                           | admin+      | unique codes                                                             |
| GET / POST      | `/admin/users?phone&role&page`, `/:id/block`, `/:id/unblock`                            | admin+      | staff targets need a super admin; blocking revokes sessions              |
| POST            | `/admin/users/:id/totp-reset`                                                           | super admin | removes the factor and revokes sessions                                  |
| GET / POST      | `/admin/orders?status&number&page`, `/:number`, `/:number/seller-orders/:id/transition` | admin+      | state machine as `ADMIN` actor                                           |
| GET             | `/admin/audit?action&entityType&entityId&actorId&before`                                | admin+      | newest first, 50 per page, `nextBefore` cursor; `action=store.` = prefix |

Phase 5 error codes: `TOTP_REQUIRED`, `TOTP_LOCKED` (429), `TOTP_NOT_SET_UP`,
`TOTP_NOT_ENABLED`, `TOTP_ALREADY_ENABLED`, `SLUG_TAKEN`, `CODE_TAKEN`,
`APPLICATION_PENDING`, `STORE_LIMIT`, `STORE_NOT_ACTIVE`, `STORE_NOT_APPROVED`,
`INVALID_TRANSITION`, `INVALID_CATEGORY`, `INVALID_ATTRIBUTES`, `SKU_TAKEN`,
`INVALID_PRICE`, `STOCK_NEGATIVE`, `IMAGE_REQUIRED`, `VARIANT_REQUIRED`,
`INVALID_IMAGE`, `FILE_TOO_LARGE`, `IMAGE_LIMIT`, `VARIANT_LIMIT`,
`PRODUCT_ARCHIVED`, `USER_NOT_FOUND`, `ALREADY_MEMBER`, `TEAM_LIMIT`,
`CATEGORY_CYCLE`, `PARENT_HAS_PRODUCTS`.

## Endpoints (Phase 6)

| Method         | Path                                                                                    | Access                | Notes                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET            | `/payments/methods`                                                                     | public                | `{ items, windowMinutes }` — only configured methods                                                       |
| POST           | `/checkout`                                                                             | session + key         | adds `paymentMethod` (`CASH_ON_DELIVERY`, `PAYME`, `CLICK`, `DEV_ONLINE`), `deliveryType`, `pickupPointId` |
| GET            | `/orders/:number/payment-link?locale=`                                                  | order owner           | provider page URL while the order is payable                                                               |
| POST           | `/orders/:number/cancel`                                                                | order owner           | whole unpaid online order (stock released)                                                                 |
| POST           | `/payments/payme`                                                                       | Payme (Basic auth)    | Merchant API JSON-RPC; HTTP 200 always                                                                     |
| POST           | `/payments/click/prepare`, `/payments/click/complete`                                   | Click (`sign_string`) | SHOP API, form-encoded                                                                                     |
| POST           | `/payments/dev/:number`                                                                 | owner, dev only       | `{ outcome: success\|cancel }` — simulated provider                                                        |
| GET            | `/delivery/quote?districtId&type&pickupPointId`                                         | session               | delivery for the caller's cart, same rules as checkout                                                     |
| GET            | `/delivery/pickup-points?districtId`                                                    | public                | active points                                                                                              |
| PATCH          | `/seller/seller-orders/:id/tracking`                                                    | store member          | `{ carrier, trackingCode }` once accepted                                                                  |
| GET / PUT      | `/seller/stores/:id/finance`, `/payout-details`                                         | owner                 | balance, held, available, ledger lines, payouts; bank details                                              |
| PUT            | `/seller/stores/:id/notifications`                                                      | owner                 | `{ telegramChatId \| null }`                                                                               |
| GET / POST     | `/admin/refunds?status`, `/admin/refunds/:id/succeed\|fail`                             | admin+                | `{ reference }` / `{ note }`                                                                               |
| GET / POST     | `/admin/payouts?status`, `/admin/stores/:id/payouts`, `/admin/payouts/:id/paid\|cancel` | admin+                | payout ≤ available balance                                                                                 |
| GET / PATCH    | `/admin/stores/:id/finance`, `/admin/stores/:id/commission`                             | admin+                | commission in basis points (`null` = category rules)                                                       |
| GET            | `/admin/ledger`                                                                         | admin+                | account balances; total is always 0                                                                        |
| GET / PUT      | `/admin/delivery/zones?regionId`, `/admin/delivery/zones/:districtId`                   | admin+                | fee / free-from in tiyin, ETA days, active                                                                 |
| GET/POST/PATCH | `/admin/delivery/pickup-points[/:id]`                                                   | admin+                | pickup points                                                                                              |

Order views add `payment { status, dueAt, paidAt }`, `deliveryType`,
`pickupPoint`, and per shipment `tracking` and `timeline`.

Phase 6 error codes: `PAYMENT_METHOD_UNAVAILABLE`, `FISCAL_DATA_MISSING`
(`details.variantIds`), `ORDER_NOT_PAYABLE`, `DELIVERY_UNAVAILABLE`,
`PAYOUT_DETAILS_MISSING`, `PAYOUT_EXCEEDS_BALANCE`. Phase 7: `TOO_MANY_UNPAID_ORDERS`
(409, a customer may hold at most 3 online orders awaiting payment). Provider callbacks use the
providers' own error codes (Payme −31001/−31003/−31007/−31008/−31050/−31051/
−32504…, Click −1…−9).

Listings use page-based pagination (numbered pages in the storefront UI);
cursor pagination stays the default for future feeds.

Phase 4 error codes: `PRODUCT_UNAVAILABLE`, `INSUFFICIENT_STOCK`
(`details.available`), `CART_LIMIT`, `CART_EMPTY`, `CART_HAS_ISSUES`,
`OUT_OF_STOCK` (`details.variantId`), `PRICE_CHANGED` (422,
`details.totalTiyin`), `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`,
`INVALID_STATE_TRANSITION` (`details.from/to`).

Auth error codes: `INVALID_PHONE`, `INVALID_CODE`, `OTP_RESEND_TOO_SOON`
(`details.retryAfterSeconds`), `OTP_LIMIT_REACHED`, `RATE_LIMITED`,
`ACCOUNT_BLOCKED`, `SMS_UNAVAILABLE`, `UNAUTHENTICATED`, `FORBIDDEN`,
`ORIGIN_NOT_ALLOWED`, `ORIGIN_REQUIRED`.

`GET /__test__/last-otp` and `POST /__test__/grant-role` exist only for browser
e2e tests: they answer 404
unless `NODE_ENV=test` and `SMS_PROVIDER=fake` (impossible in production).

## Mobile app protocol (Phase 8, ADR 0022)

- The app sends `X-UZGO-Client: mobile`. `POST /auth/otp/verify` then answers
  `{ user, session: { token, expiresAt } }` and sets no cookie; later requests
  send `Authorization: Bearer <token>` (same sessions, expiry and revocation as
  the web cookie). Bearer requests carry no cookies, so the origin check for
  browsers does not apply to them.
- Guest cart: the API returns a new guest token in the `X-Cart-Token`
  response header; the app sends it back in `X-Cart-Token` (honoured only
  with the mobile marker) and it is merged into the account at login.

| Method | Path                       | Auth | Notes                                                                                                                       |
| ------ | -------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| PUT    | `/push-devices`            | user | `{ token: "ExponentPushToken[…]", platform: "IOS" \| "ANDROID" }`; bound to the current session (logout removes it); 10/min |
| POST   | `/push-devices/unregister` | user | `{ token }`; only the caller's own device                                                                                   |

Push payloads (`pushDataSchema`): `{ type: "order", number }` or
`{ type: "shipment", storeId }`.

## Market growth (Phase 9a, ADR 0023)

| Method | Path                                    | Auth             | Notes                                                                                       |
| ------ | --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/favorites`                            | user             | Saved products (visible ones) as product cards                                              |
| GET    | `/favorites/ids`                        | user             | `{ productIds }`                                                                            |
| PUT    | `/favorites/:productId`                 | user             | 204; max 500 (`FAVORITES_LIMIT`); 60/min                                                    |
| DELETE | `/favorites/:productId`                 | user             | 204                                                                                         |
| GET    | `/catalog/products/:slug/reviews?page=` | public           | Published reviews, 10 per page, star `distribution`; cached 60 s                            |
| GET    | `/products/:slug/reviews/mine`          | user             | `{ canReview, review }` (`hidden` when a moderator hid it)                                  |
| PUT    | `/products/:slug/reviews/mine`          | user             | `{ rating 1–5, text? ≤1000, no links }`; only after delivery (`REVIEW_NOT_ALLOWED`); 10/min |
| DELETE | `/products/:slug/reviews/mine`          | user             | 204                                                                                         |
| GET    | `/admin/reviews?status=&maxRating=`     | moderator + TOTP | Newest first, masked author phone                                                           |
| POST   | `/admin/reviews/:id/hide`               | moderator + TOTP | `{ note }` (staff only), audited                                                            |
| POST   | `/admin/reviews/:id/publish`            | moderator + TOTP | Audited                                                                                     |
| GET    | `/admin/promo-codes`                    | admin + TOTP     | With uses and UZGO cost                                                                     |
| POST   | `/admin/promo-codes`                    | admin + TOTP     | `createPromoSchema`; terms fixed afterwards; `PROMO_CODE_TAKEN`                             |
| PATCH  | `/admin/promo-codes/:id`                | admin + TOTP     | `{ active?, endsAt?, usageLimit?, description? }`                                           |

- `GET /delivery/quote?…&promoCode=` (30/min) adds `discountTiyin`, `promo`,
  `promoError` (`PROMO_INVALID`, `PROMO_EXPIRED`, `PROMO_MIN_ORDER` with
  `promoMinOrderTiyin`, `PROMO_LIMIT_REACHED`); `totalTiyin` is items +
  delivery − discount.
- `POST /checkout` accepts `promoCode`; `expectedTotalTiyin` is the
  discounted total. An unusable code fails with its `PROMO_*` code (422).
- Order views carry `discountTiyin` and `promoCode`; shipments carry
  `discountTiyin` (their share), `deliveredAt`, `returnUntil`,
  `returnRequest { reason, comment }` and `returnDecisionNote`.
- Transitions: `RETURN_REQUESTED` needs `returnReason` + `returnComment`
  (`RETURN_REASON_REQUIRED`) inside the window (`RETURN_WINDOW_CLOSED`, 409);
  `RETURN_REJECTED` needs `reason`, the note shown to the customer
  (`DECISION_NOTE_REQUIRED`).
- Product cards and detail carry `rating: { average, count } | null`.

## UZGO Food (Phase 9b, ADR 0024)

Points are `{ lat, lng }` (WGS-84, inside Uzbekistan's bounding box). Fees are
decided on the server: restaurant delivery (SELF) is the restaurant's flat
fee; UZGO delivery is `FOOD_COURIER_BASE_TIYIN + FOOD_COURIER_PER_KM_TIYIN ×
road km` (straight line × 1.3), rounded up to 100 so'm.

| Method | Path                                            | Auth                   | Notes                                                                                              |
| ------ | ----------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/food/restaurants?lat=&lng=&regionId=`         | public                 | Live restaurants; with a point: nearest first, `delivery { feeTiyin, etaMinutes }` or out of range |
| GET    | `/food/restaurants/:slug?lat=&lng=`             | public                 | Restaurant, open now, menu by category                                                             |
| GET    | `/food/geocode?q=&locale=`                      | public                 | Address search via OpenStreetMap Nominatim; 20/min                                                 |
| GET    | `/food/reverse?lat=&lng=&locale=`               | public                 | `{ label }`; 20/min                                                                                |
| POST   | `/food/quote`                                   | public                 | `{ storeId, point, lines[{ menuItemId, quantity }] }` → items, delivery, total, errors; 60/min     |
| POST   | `/food/checkout`                                | user + Idempotency-Key | `foodCheckoutSchema`; cash, Payme or Click; `expectedTotalTiyin` must match; 10/min                |
| GET    | `/restaurant/:storeId`                          | store member           | Restaurant (kind RESTAURANT) for its team                                                          |
| GET    | `/restaurant/:storeId/orders?scope=active\|all` | store member           | Kitchen tickets with lines, address, courier                                                       |
| PATCH  | `/restaurant/:storeId/settings`                 | store member           | `{ acceptingOrders }`                                                                              |
| PATCH  | `/restaurant/:storeId/menu-items/:itemId`       | store member           | `{ available }` (stop-list)                                                                        |
| GET    | `/courier/me`                                   | courier                | Status, vehicle, online, cash balance, active jobs                                                 |
| PUT    | `/courier/status`                               | courier                | `{ online, lat?, lng? }`; going online needs a point (`LOCATION_REQUIRED`)                         |
| PUT    | `/courier/location`                             | courier                | `{ lat, lng }`; 12/min                                                                             |
| GET    | `/courier/offers`                               | courier                | Unassigned UZGO orders (cooking/ready) within `FOOD_OFFER_RADIUS_KM`; no customer details          |
| POST   | `/courier/offers/:id/accept`                    | courier                | First courier wins (`OFFER_TAKEN`, 409); max 3 active (`TOO_MANY_JOBS`); 20/min                    |
| POST   | `/courier/orders/:id/transition`                | courier (assigned)     | `{ to: HANDED_TO_DELIVERY\|DELIVERED\|DELIVERY_FAILED, reason? }`                                  |
| GET    | `/admin/restaurants`                            | admin + TOTP           | All restaurants                                                                                    |
| POST   | `/admin/restaurants`                            | admin + TOTP           | `createRestaurantSchema` (owner phone, region/district, point, mode, hours); audited               |
| PATCH  | `/admin/restaurants/:id`                        | admin + TOTP           | `updateRestaurantSchema`; audited                                                                  |
| POST   | `/admin/restaurants/:id/cover`                  | admin + TOTP           | Image upload; 30/min                                                                               |
| POST   | `/admin/restaurants/:id/menu/categories`        | admin + TOTP           | Menu section; PATCH `…/:categoryId` to edit                                                        |
| POST   | `/admin/restaurants/:id/menu/items`             | admin + TOTP           | Dish; PATCH `…/:itemId`, POST `…/:itemId/image`                                                    |
| GET    | `/admin/couriers`                               | admin + TOTP           | Couriers with cash balance                                                                         |
| POST   | `/admin/couriers`                               | admin + TOTP           | `{ phone, vehicle }`; grants role COURIER; audited                                                 |
| PATCH  | `/admin/couriers/:userId`                       | admin + TOTP           | `{ status?, vehicle? }`                                                                            |
| POST   | `/admin/couriers/:userId/settlements`           | admin + TOTP           | Cash handed in / fee paid out; never more than the balance; audited                                |

- Food order flow: `NEW → ACCEPTED (cooking) → PACKED (ready) →
HANDED_TO_DELIVERY → DELIVERED`, plus cancel and delivery-failed; no
  returns. With UZGO delivery only the assigned courier (or staff) hands over
  and delivers; with SELF delivery the restaurant does.
- Orders not accepted within `FOOD_ACCEPT_TIMEOUT_MINUTES` are cancelled by a
  job (online payments refunded).
- Order views carry `kind` (`MARKET`/`FOOD`) and `food { restaurant, mode,
courier, eta, point }` for food orders.
- Push payloads add `{ type: "courier" }` (new offers near the courier).

## UZGO Go (Phase 9c, ADR 0025)

The price is fixed before ordering and decided on the server: per class
`base + perKm × road km` (straight line × 1.3), rounded up to 500 soʻm
(`RIDE_ECONOMY_*`, `RIDE_COMFORT_*`). A ride is an `Order` of kind `RIDE`;
its number is the ride's id in URLs. Payment links and the dev payment use
the existing `/orders/:number/payment-link` and `/payments/dev/:number`.

| Method | Path                                 | Auth                   | Notes                                                                                             |
| ------ | ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------- |
| POST   | `/rides/quote`                       | public                 | `{ pickup, dropoff }` → distance, ETA, `tooFar`, price per class, `driversNearby`; 60/min         |
| POST   | `/rides`                             | user + Idempotency-Key | `rideRequestSchema`; `expectedPriceTiyin` must match (`PRICE_CHANGED`); one open ride; 10/min     |
| GET    | `/rides`                             | user                   | The rider's rides, newest first                                                                   |
| GET    | `/rides/:number`                     | user (own)             | Live view; driver phone and position only while active                                            |
| POST   | `/rides/:number/cancel`              | user (own)             | Before the trip starts; a paid ride is refunded in full                                           |
| GET    | `/driver/application`                | user                   | `{ application }` (null: never applied)                                                           |
| PUT    | `/driver/application`                | user                   | Apply or correct a rejected one (`acceptTerms: true`); `PLATE_TAKEN`, `APPLICATION_LOCKED`; 5/min |
| GET    | `/driver/me`                         | approved driver        | Status, class, car, balance, active ride                                                          |
| PUT    | `/driver/status`                     | approved driver        | `{ online, lat?, lng? }` (online needs a point)                                                   |
| PUT    | `/driver/location`                   | approved driver        | `{ lat, lng }`; 20/min                                                                            |
| GET    | `/driver/offers`                     | approved driver        | Searching rides within `RIDE_OFFER_RADIUS_KM`, class the car may serve; no rider details          |
| POST   | `/driver/offers/:id/accept`          | approved driver        | First driver wins (`OFFER_TAKEN`); one active ride (`DRIVER_BUSY`); 20/min                        |
| POST   | `/driver/rides/:id/action`           | the ride's driver      | `{ action: ARRIVED \| START \| COMPLETE \| RELEASE \| NO_SHOW }`                                  |
| GET    | `/admin/drivers?status=`             | admin + TOTP           | Applications and drivers with balance and completed rides                                         |
| POST   | `/admin/drivers/:userId/review`      | admin + TOTP           | `{ decision: APPROVE \| REJECT, note?, rideClass? }` (reject needs a note); audited               |
| PATCH  | `/admin/drivers/:userId`             | admin + TOTP           | `{ status?: ACTIVE \| SUSPENDED, rideClass?, note? }`; audited                                    |
| POST   | `/admin/drivers/:userId/settlements` | admin + TOTP           | Commission handed in (negative) or payout (positive); never past the balance; audited             |
| GET    | `/admin/rides?status=`               | admin + TOTP           | Newest 200                                                                                        |
| POST   | `/admin/rides/:number/cancel`        | admin + TOTP           | `{ reason }`; audited                                                                             |

- Ride statuses: `AWAITING_PAYMENT → SEARCHING → ACCEPTED → ARRIVED →
IN_PROGRESS → COMPLETED`, plus `CANCELLED` and `NO_DRIVER` (nobody took it
  within `RIDE_SEARCH_TIMEOUT_MINUTES`; a job closes it and refunds).
  `RELEASE` returns an accepted ride to `SEARCHING`.
- Payme/Click for rides need `RIDE_MXIK_CODE` and `RIDE_PACKAGE_CODE`
  (`FISCAL_DATA_MISSING` otherwise).
- `GET /orders` lists shop and food orders only.
- Push payloads add `{ type: "ride", number }` and `{ type: "driver" }`.

## Pagination

- Lists use cursor pagination: `?limit=20&cursor=<opaque>` →
  `{ "items": [...], "nextCursor": "…" | null }`. Max `limit` 100.
- Admin tables may use `?page=&pageSize=` → `{ items, page, pageSize, total }`.
- Sorting: `?sort=price_asc|price_desc|newest|popular` (allow-listed per endpoint).
- Filters: explicit query params validated by Zod; unknown params rejected.

## Idempotency

- Required header `Idempotency-Key` (UUID) on: order creation and every payment
  operation (create, refund). Optional on other POSTs.
- Stored per user with a hash of the request body. Same key + same body →
  original response replayed. Same key + different body → `409 IDEMPOTENCY_KEY_REUSED`.
- Keys kept 7 days.

## Rate limits

Per IP and per phone on OTP; per user/IP on writes. Response `429` with
`Retry-After`. In-memory first; Redis only via ADR. The full table is in
`SECURITY.md` → "Rate limits". Server-to-server calls from the web app carry
`x-uzgo-internal-token` and `x-uzgo-client-ip` so they count against the
visitor's IP (ADR 0021); the forwarded IP is ignored without a valid token.

## Health

- `GET /api/v1/health/live` → `200 { "status": "ok" }` when the process runs.
- `GET /api/v1/health/ready` → `200` when the DB is reachable, otherwise `503`.

## Versioning of contracts

`packages/contracts` is the single source of truth. A typed client generated
from OpenAPI is introduced in Phase 4; until then the web uses a thin typed
fetch wrapper over the same Zod schemas.
