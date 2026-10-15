# 0022 — Mobile apps: Expo (React Native), bearer sessions, push

- Status: Accepted (owner: "whichever is better" → recommendation taken; scope "everything")
- Date: 2026-10-15
- Builds on: 0003 (Zod contracts), 0004 (OTP + DB sessions), 0019 (notification outbox)

## Context

SPEC §20 asks to reassess Flutter vs React Native for Phase 8, on the same API.
Current stable versions checked on 2026-10-15: Expo SDK 57 (React Native 0.86,
React 19.2), Flutter 3.47.7. The owner works only from a phone/iPad; CI is the
source of truth.

## Decision

1. **Expo (React Native) + Expo Router + TypeScript** in `apps/mobile`, part of
   the pnpm monorepo.
   - Reuses `@uzgo/contracts` (Zod schemas, types, error codes) and the design tokens;
     the same lint/typecheck/test tooling and the same language as web and API.
   - Testable without a computer: Expo Go / development builds via QR,
     cloud builds (EAS), over-the-air JS updates for fixes.
   - Flutter would need a second implementation of every model, rule and
     message in Dart, plus macOS for iOS builds.
2. **Scope (owner: "everything")**: buyer app (catalog, search, product, cart,
   OTP login, checkout with cash or online payment, orders with tracking,
   profile, uz/ru), seller screens (shipments of the user's stores: accept,
   pack, hand over with tracking, deliver, cancel), push notifications.
   Product editing and admin stay in the web panels.
3. **Auth**: the app sends `X-UZGO-Client: mobile`; OTP verify then returns
   the opaque session token in the body (never a cookie) and the app sends
   `Authorization: Bearer <token>`. Same `Session` table, same expiry,
   revocation and logout (ADR 0004). The token is kept in the OS keystore
   (`expo-secure-store`). Bearer requests carry no cookies, so the CSRF origin
   rule does not apply to them; browsers keep cookies and the origin guard.
4. **Guest cart**: token in the `X-Cart-Token` header (only honoured with the
   mobile marker), merged into the account at login, like the web cookie.
5. **Push**: `PushDevice` rows (Expo push token, platform) bound to the session
   that registered them — logout or revocation stops pushes to that phone.
   The outbox gets a `PUSH` channel (recipient = user id) next to SMS and
   Telegram; texts carry only the order/shipment number and status, payload a
   deep link (`order` / `shipment`). Sending goes through the **Expo Push
   Service** behind a `PushProvider` adapter (Fake in tests, Dev logger in
   development); tokens reported `DeviceNotRegistered` are deleted. FCM and
   APNs credentials live in the Expo project, not on our server.
6. **Online payment** opens the provider page in the system browser
   (`expo-web-browser`); the app refreshes the order when it closes. Card data
   never touches the app.

## Consequences

- Owner actions: Expo account (free), Google Play developer account, Apple
  Developer Program for iOS; Firebase project for Android push credentials.
- The Expo push service is outside Uzbekistan: push texts contain no personal
  data (privacy policy updated).
- No device-level E2E in CI (no emulator); CI runs lint, typecheck, unit tests
  and a full JS bundle export for Android and iOS. Manual test checklist in
  `docs/MOBILE.md`.
