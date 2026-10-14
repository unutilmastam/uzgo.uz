# VISION — UZGO Market

## One line
An original, trustworthy multi-vendor marketplace for Uzbekistan: many sellers,
one storefront, one cart. Web first, mobile later. The first module of the
future UZGO ecosystem.

## Owner's brief (Phase 0 input)
The owner wants a marketplace comparable in *model* to large regional
marketplaces, but with its own brand, identity and design — no copying.

| Topic | Owner input | Status |
|---|---|---|
| Goal | Multi-vendor online marketplace for Uzbekistan, own brand | Confirmed |
| Platform | Web first, mobile apps later (Phase 8) | Confirmed |
| Languages | Uzbek Latin primary, Russian second | Confirmed |
| Launch region | Example given: Surxondaryo first, then all of Uzbekistan | **Working assumption — owner to confirm** |
| First seller categories | Examples given: clothing, electronics, groceries, household appliances | **Working assumption — owner to confirm** |
| Style | Modern, clean, premium, mobile-friendly | Confirmed |
| Mood | Trustworthy, fast, bright but not excessive | Confirmed |
| Primary colour | Examples given: deep blue + green / purple / dark orange | **Proposal in DESIGN_SYSTEM.md (deep blue + green); owner confirms in Phase 2** |
| Light and dark mode | Required | Confirmed |
| Logo | None yet — simple text wordmark "UZGO" | Confirmed (proposal in DESIGN_SYSTEM.md) |
| Sites the owner likes (feel only) | Examples: Uzum Market, Apple, Airbnb | Used as *feel* references only; no assets, colours or layouts copied |

Note on the launch region: the code never hardcodes a region. Regions and
districts are reference data, and delivery coverage is configured per district
(SPEC §3). Starting in one region is a business setting, not a code decision.

Note on groceries: perishable food needs cold chain, expiry dates and faster
delivery. Recommendation: launch with non-perishable goods (clothing,
electronics, household appliances, packaged groceries), add perishable food
only after delivery (Phase 6) works. Owner decides.

## Users
| User | Needs |
|---|---|
| **Customer** | Find products fast on a phone, trust the price and seller, log in with phone + SMS code, pay cash/card on delivery (online later), track orders, return items. |
| **Seller** (store owner, store staff) | Open a store, list products with variants, manage stock and prices, receive and fulfil only their own orders, see sales and payouts. |
| **Moderator** | Review products and stores before they go live; handle complaints. |
| **Admin / Super admin** | Manage categories, sellers, users, commission, delivery zones, platform settings; see audit logs. |

## MVP boundary (end of Phase 5)
In MVP:
- Uzbek/Russian storefront, categories, product pages, search with Uzbek
  apostrophe and Latin/Cyrillic tolerance.
- Phone + OTP login, sessions, roles.
- Stores, products with variants, stock, moderation.
- Cart (multi-seller), checkout with cash/card on delivery, one order split into
  one shipment per seller, order tracking by status.
- Seller panel and admin panel inside the web app.

After MVP (Phase 6+): online payments, fiscal receipts, refunds, delivery zones
and pickup points, seller ledger and payouts, notifications, reviews, promo
codes, mobile apps.

## Explicit non-goals (for now)
- No other ecosystem services (Delivery, Go, Food, Maps, AI) until Phase 9.
  They may appear only as non-interactive "Tez kunda / Скоро" cards.
- No microservices, no Kubernetes, no cloud-computing product.
- No own payment processing or card storage.
- No native mobile apps before Phase 8.
- No cross-border sales, no foreign currencies.
- No copying of another company's brand, colours, layout or assets.

## Success signals (to measure after launch)
- Time from opening the site on a phone to adding to cart.
- Checkout completion rate; share of orders delivered vs cancelled.
- Number of active sellers and approved products per category.
- Page load on a mid-range Android phone over 4G.
