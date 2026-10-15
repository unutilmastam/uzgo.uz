# 0018 — Ledger, commission, refunds and payouts (Phase 6)

- Status: Accepted
- Date: 2026-10-15
- Builds on: 0005 (money in tiyin), 0015 (orders), 0017 (UZGO as merchant of record)

## Decision

**Double-entry ledger.** `LedgerEntry` rows grouped by `journalId`; positive =
debit, negative = credit; every journal sums to zero. The database enforces it
(deferred constraint trigger at commit) and forbids UPDATE/DELETE. Accounts:

| Account                | Meaning                                                   |
| ---------------------- | --------------------------------------------------------- |
| `PROVIDER_CLEARING`    | money at the providers / UZGO bank account                |
| `CUSTOMER_PREPAYMENTS` | customers' money for goods not delivered yet (liability)  |
| `SELLER_PAYABLE`       | owed to each store (per `storeId`; negative = store owes) |
| `PLATFORM_REVENUE`     | UZGO commission                                           |

| Event                                | Journal                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| online payment captured (total T)    | Dr CLEARING T / Cr PREPAYMENTS T                          |
| shipment delivered, paid online      | Dr PREPAYMENTS S / Cr SELLER_PAYABLE S−C / Cr REVENUE C   |
| shipment delivered, cash on delivery | Dr SELLER_PAYABLE C / Cr REVENUE C (seller kept the cash) |
| returned (online / cash)             | reverse the delivery entry (cash: commission only)        |
| refund succeeded (R)                 | Dr PREPAYMENTS R / Cr CLEARING R                          |
| payout paid (P)                      | Dr SELLER_PAYABLE P / Cr CLEARING P                       |

**Commission** in basis points: store override → nearest category rate →
`COMMISSION_DEFAULT_BP` (0 until the owner decides rates). Each order line
snapshots its rate; `floor(line × bp / 10 000)` (rounding favours the seller);
the shipment stores the sum. Revenue is recognised at delivery.

**Refunds.** A paid shipment that is cancelled, fails delivery or is returned
gets a `PENDING` refund for its total (one open refund per shipment, unique
index). Payme and Click have no partial-refund API we can rely on, so staff
return the money in the provider's cabinet and mark the refund `SUCCEEDED`
with the provider reference (or `FAILED`); the ledger posts on success. A full
refund started by the provider (Payme `CancelTransaction` on a performed
transaction) cancels the open shipments, supersedes pending refunds and posts
one refund; it is refused once part of the money was already returned or
goods are on the way. The simulated `DEV_ONLINE` provider completes refunds at
once.

**Payouts.** Store owners save bank details (MFO 5 digits, account 20 digits;
audit keeps only the last 4 digits). Available = payable balance − earnings
delivered within `PAYOUT_HOLD_DAYS` (return window, default 10) − pending
payouts. Admins create a payout (store row locked; bank details snapshotted),
then mark it paid with the bank reference (ledger) or cancel it.

## Consequences

Balances are always derived from the ledger, never stored. Bank transfers and
provider refunds remain manual steps for staff until provider/bank APIs are
contracted; every step is audited.
