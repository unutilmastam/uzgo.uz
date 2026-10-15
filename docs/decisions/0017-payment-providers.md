# 0017 — Online payment providers (Phase 6)

- Status: Accepted (owner confirmed on 2026-10-15; going live still needs the
  owner actions below, especially the lawyer's review)
- Date: 2026-10-15
- Builds on: 0005 (money in tiyin), 0006 (Order + SellerOrder), 0015 (checkout)

## Context

Customers in Uzbekistan pay online mostly with UzCard/Humo cards through
payment apps. Cash on delivery (Phase 4) stays. One UZGO order can contain
items from several stores (ADR 0006), so one payment must cover several
sellers.

Research was done on 2026-10-15. The providers' documentation sites
(developer.help.paycom.uz, docs.click.uz, developer.uzumbank.uz) are not
reachable from the build environment, so facts below come from search
snippets of those official pages and from the providers' official GitHub
libraries. Every item marked **(verify)** must be checked against the official
documentation and the merchant contract during implementation.

## Candidates

| Topic            | Payme (Paycom) Merchant API                                                                                                                                                                                                             | Click SHOP API (+ Merchant API)                                                                                                                                                                     | Uzum Bank Merchant API / Checkout                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Callback model   | Payme calls **our** endpoint (JSON-RPC 2.0 over HTTPS): `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction`, `GetStatement` (+ optional `SetFiscalData`)                      | Click calls **our** endpoints twice: `Prepare` (`action=0`), then `Complete` (`action=1`), form-encoded; our answer carries `error` (0 = success)                                                   | Merchant API: Uzum calls our `/check`, `/create`, `/confirm`, `/reverse`, `/status`; Checkout: we call Uzum (verify) |
| Authentication   | `Authorization: Basic base64(login:KEY)`; a separate TEST KEY for the sandbox; wrong credentials → error `-32504`; Payme also documents source IP ranges (verify)                                                                       | `sign_string` = MD5 over the request fields joined without separators: `click_trans_id, service_id, SECRET_KEY, merchant_trans_id, [merchant_prepare_id,] amount, action, sign_time` (verify order) | Basic auth (verify); Checkout may use mutual TLS (verify)                                                            |
| Amount units     | integer **tiyin**                                                                                                                                                                                                                       | **soʻm** with decimals (e.g. `5000.00`) — converted with string arithmetic, never floats                                                                                                            | tiyin (verify)                                                                                                       |
| Wrong amount     | error `-31001` on Check/Create                                                                                                                                                                                                          | error `-2` (verify)                                                                                                                                                                                 | (verify)                                                                                                             |
| Timeouts         | a created transaction expires if not performed in time (12 h, verify) → cancelled                                                                                                                                                       | Complete can report a failed/cancelled payment (`error < 0`)                                                                                                                                        | (verify)                                                                                                             |
| Refunds          | `CancelTransaction` cancels created **and performed** transactions (`state -2`, with a `reason`); `-31007` if the order may no longer be cancelled                                                                                      | reversal through the Click Merchant API (`api.click.uz/v2/merchant/`, SHA1 auth digest) (verify)                                                                                                    | `/reverse` (Merchant) or Checkout reverse with amount (verify)                                                       |
| Fiscal receipts  | receipt `detail` in the `CheckPerformTransaction` answer: `receipt_type`, `items[]` (title, price, count, **IKPU/MXIK code**, **package code**, VAT percent, discount), `shipping`; commission-agent data per item (verify field names) | fiscal items sent through the Click Merchant API (OFD) with IKPU and package code (verify endpoint)                                                                                                 | Checkout: fiscal params at creation + receipt call (verify)                                                          |
| Test environment | official sandbox with TEST KEY (documented "Песочница" page)                                                                                                                                                                            | Click web sandbox / test scenarios (verify access)                                                                                                                                                  | test host (verify)                                                                                                   |

Sources (official pages seen through search): Payme
[Ошибки](https://developer.help.paycom.uz/metody-merchant-api/oshibki-errors/),
[Песочница](https://developer.help.paycom.uz/pesochnitsa/),
[Схема взаимодействия](https://developer.help.paycom.uz/protokol-merchant-api/skhema-vzaimodeystviya/),
[CheckPerformTransaction](https://developer.help.paycom.uz/metody-merchant-api/checktransaction/),
[CancelTransaction](https://developer.help.paycom.uz/metody-merchant-api/canceltransaction/);
Click [Request](https://docs.click.uz/en/?p=15),
[click-llc/click-integration-php](https://github.com/click-llc/click-integration-php);
Uzum [developer portal](https://developer.uzumbank.uz/en/),
[merchants](https://merchants.uzumbank.uz/en/).

## Decision (proposed)

1. **Launch with Payme and Click**, the two most used payment apps; add Uzum
   Bank later behind the same interface. Cash on delivery stays.
2. **UZGO is the single merchant of record for online payments** (one Payme
   cashbox, one Click service). Each `Order` gets one `PaymentAttempt` for the
   whole order; sellers are paid out later from the ledger
   (`LedgerEntry` → `Payout`) minus commission. Alternative (each seller with
   its own Payme/Click account) is rejected: one multi-store cart cannot be
   paid in one step, and every seller would need a merchant contract.
   **This needs the lawyer's confirmation** (commission-agent / marketplace
   scheme, fiscal receipts on behalf of sellers with the seller's TIN, payout
   rules) — see "Owner actions".
3. **Fiscal receipts through the payment provider's OFD integration**: every
   variant already stores `mxikCode` (IKPU), `packageCode` and `vatRateBp`;
   online payment is offered only when every item in the cart has them.
   Sellers fill them in their panel (made mandatory for online sale).
4. **Security rules for all adapters** (`PaymentProvider` interface, adapters
   `PaymeProvider`, `ClickProvider`; `FakePaymentProvider` only in tests/dev,
   clearly labelled):
   - callbacks are accepted only with a valid signature/credentials (constant-
     time comparison) and, where documented, from the provider's IP ranges;
   - the amount is always checked against the server-side order total; the
     client never sends an amount;
   - idempotency per provider transaction id (unique index), so duplicate
     callbacks do not double-pay; state changes are conditional updates;
   - payment and refund amounts are integer tiyin; Click's soʻm strings are
     converted with string arithmetic;
   - every callback and decision is audited; secrets only in env.
5. **Order flow with online payment:** checkout creates the order in
   `AWAITING_PAYMENT` with a **stock reservation** (expires with the payment
   window); a confirmed payment moves shipments to `NEW`; an expired or
   cancelled payment releases the stock and cancels the order.

## Owner actions (needed before implementation can be finished)

| #   | What                                                                                                    | Why                                    |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | Registered legal entity for UZGO (MChJ), bank account                                                   | merchant contracts are signed with it  |
| 2   | Lawyer: marketplace / commission-agent scheme, receipts on behalf of sellers, payouts, refunds, returns | decides point 2 of the decision        |
| 3   | **Payme Business**: merchant (cashbox) ID, KEY, TEST KEY, sandbox access                                | Payme adapter                          |
| 4   | **Click**: `service_id`, `merchant_id`, `merchant_user_id`, `SECRET_KEY`, sandbox access                | Click adapter                          |
| 5   | Fiscalization setup with both providers (OFD), confirmed IKPU/package codes for launch categories       | fiscal receipts                        |
| 6   | Commission rates per category/store (open decision in ROADMAP)                                          | ledger and payouts                     |
| 7   | Production hosting with a fixed HTTPS domain (callbacks need a public URL)                              | providers must reach the callback URLs |

Until 3–4 exist, implementation can proceed against the documented protocols
with `FakePaymentProvider` and recorded sandbox scenarios; the real adapters
are switched on only with the owner's credentials.

## Delivery (same phase, no external provider needed yet)

`DeliveryZone` per district (fee in tiyin, ETA), `PickupPoint`, seller-managed
shipment tracking and notifications through an adapter (SMS provider still an
open decision; Telegram bot as a second channel). External courier/map
providers are a separate later decision.

## Consequences

Online payments add an `AWAITING_PAYMENT` state, reservations with expiry and
a background job to expire them. UZGO holds sellers' money between payment and
payout, which is why the legal check (owner action 2) is a hard prerequisite
for going live.
