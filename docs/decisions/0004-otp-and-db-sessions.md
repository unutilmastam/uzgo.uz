# 0004 — Phone OTP login with database sessions

- Status: Accepted
- Date: 2026-10-14
- Source: docs/SPEC.md §9

## Context
In Uzbekistan phone + SMS code is the dominant login pattern. Long-lived JWTs in browser storage are hard to revoke and exposed to XSS.

## Decision
Customers log in with phone + 6-digit OTP (hashed, short TTL, attempt and rate limits) sent through an SmsProvider adapter. Sessions are opaque random tokens; only their hash is stored in a Session table; the token is sent in an HttpOnly, Secure, SameSite=Lax cookie. Staff accounts add TOTP before production. Mobile apps will use the same sessions as bearer tokens.

## Consequences
Easy revocation and logout-all; each request needs a session lookup (indexed, cheap). Real SMS provider and its cost are an open decision; SMS pumping must be rate-limited.
