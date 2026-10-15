# Architecture Decision Records

One file per significant decision: `NNNN-short-title.md` with Status, Context,
Decision, Consequences. Superseded ADRs stay, marked "Superseded by NNNN".

| #    | Decision                                        |
| ---- | ----------------------------------------------- |
| 0001 | Modular monolith                                |
| 0002 | Prisma lives only in apps/api                   |
| 0003 | Zod contracts shared by web and API             |
| 0004 | Phone OTP login with database sessions          |
| 0005 | Money as BigInt tiyin                           |
| 0006 | Multi-seller order split (Order + SellerOrder)  |
| 0007 | Same-site API under /api                        |
| 0008 | GitHub Actions CI as source of truth            |
| 0009 | Toolchain versions (Phase 1)                    |
| 0010 | Empty baseline migration in Phase 1             |
| 0011 | Security baseline from Phase 1                  |
| 0012 | Design system and web i18n (Phase 2)            |
| 0013 | Authentication implementation details (Phase 3) |
| 0014 | Product search in PostgreSQL (Phase 4)          |
| 0015 | Checkout and orders (Phase 4, cash on delivery) |
| 0016 | Seller onboarding, back office and staff TOTP   |
| 0017 | Online payment providers (Payme + Click)        |
| 0018 | Ledger, commission, refunds and payouts         |
