# 0023 — Market growth: reviews, favorites, returns, UZGO promo codes

- Status: Accepted (owner chose all Phase 9 directions, "Hammasi"; 9a is the marketplace part)
- Date: 2026-10-16
- Builds on: 0005 (money in tiyin), 0015 (checkout), 0017 (payments), 0018 (ledger)

## Context

Phase 9a deepens the marketplace before new services (Food, Go, AI) are added:
customers need trust signals (ratings), a way to keep products for later,
a clear return process, and UZGO needs promotions. Money rules are unchanged:
the server decides every amount, the ledger always balances.

## Decision

1. **Favorites**: `Favorite (userId, productId)`, up to 500 per customer.
   Hidden or deleted products are skipped in the list, not removed.
2. **Reviews and ratings**:
   - Only a customer who **received** the product (a shipment of theirs with
     it reached DELIVERED, RETURN_REQUESTED, RETURNED or RETURN_REJECTED) may
     review it; one review per customer and product (edit or delete it).
   - Rating 1–5, optional text up to 1000 characters, links refused (spam).
     Shown as plain text; the author appears as "first name + last initial".
   - `Product.ratingSum / ratingCount` count PUBLISHED reviews and change in
     the same transaction as the review, under a row lock (no drift; CHECK
     keeps them in range).
   - Moderators (with TOTP) hide a review with a note (audited) or publish it
     again; editing a hidden review keeps it hidden.
3. **Returns**:
   - `SellerOrder.deliveredAt` is set on delivery; a return can be requested
     in the app for `RETURN_WINDOW_DAYS` (default 10) after it. In production
     the window must not exceed `PAYOUT_HOLD_DAYS` (env validation): money
     still on hold can be reversed from the seller's balance.
   - A request needs a reason (DEFECTIVE, WRONG_ITEM, NOT_AS_DESCRIBED,
     DAMAGED_IN_DELIVERY, CHANGED_MIND, OTHER) and a comment; rejecting needs a
     decision note shown to the customer. Statutory rights beyond the window
     (warranty, defects) go through support — the legal text is for the lawyer.
4. **Promo codes are funded by UZGO**, not by sellers:
   - PERCENT (basis points, optional cap) or FIXED; minimum order, start/end,
     total and per-customer limits. Terms are fixed at creation; admins can
     switch a code off, extend it or change its limit (all audited, TOTP).
   - The discount applies to **items only** (never delivery), rounds down, is
     split over the order lines by largest remainder and summed per shipment.
     `Order.totalTiyin = items + delivery − discount` (CHECK); shipment totals
     stay at full price because the seller is paid on them.
   - Checkout locks the code row (`FOR UPDATE`) and counts uses over orders
     that are not cancelled, so concurrent checkouts can never exceed a limit;
     a cancelled order gives its use back. The quote endpoint reports why a
     code does not apply (PROMO_INVALID / EXPIRED / MIN_ORDER / LIMIT_REACHED)
     and is throttled (30/min) so it is not a code-guessing oracle.
   - Ledger: new account `PLATFORM_PROMOTIONS` (UZGO expense).
     - Online, delivered: prepayment (total − discount) + promotions (discount)
       → seller payable (total − commission) + revenue (commission).
     - Cash, delivered: the seller collected total − discount, so their
       payable moves by commission − discount; promotions + discount.
     - Returns mirror these entries; refunds are what the customer paid
       (shipment total − its discount).
   - Payme fiscal receipt: per-line `discount` and a `shipping` line so lines
     add up to the paid amount. **Verify the exact format with Payme** before
     going live (sandbox), like the rest of ADR 0017.
   - Sellers see the cash amount to collect and that UZGO covers the discount.

## Consequences

- Order money columns stay immutable after checkout (trigger), including the
  discount; a migration replaced the original "total = items + delivery" check.
- Payouts to sellers are unaffected by promotions; UZGO's promo cost is
  visible in the ledger summary and per code in the admin panel.
- Click receipts carry no item lines in our integration (amount only), so no
  change there.
- Open for the owner + lawyer: return policy wording and window, whether
  CHANGED_MIND returns are accepted for all categories, promo terms text.
