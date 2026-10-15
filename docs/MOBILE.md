# MOBILE — UZGO app (Phase 8, ADR 0022)

`apps/mobile`: Expo SDK 57 (React Native 0.86), Expo Router, TypeScript. One
code base for Android and iOS; it talks to the same API as the website.

## What the app does

| Area   | Screens                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer  | Home (search, categories, recommendations), catalog tree, category and search results (sort, load more), product (photos, variant options, quantity), cart (guest or account), SMS login, checkout (region/district, courier or pickup point, delivery price from the server, cash or Payme/Click), orders, order details (status, tracking code, history, pay now, cancel, return request), cabinet (name, language, notifications, legal pages, logout / logout everywhere) |
| Seller | My stores → shipments (active/all): accept, packed, hand over, delivered, cannot deliver, cancel; tracking code; call the recipient. Products and finances stay in the web panel (link in the app).                                                                                                                                                                                                                                                                           |
| Push   | New shipment → store members' phones; accepted / handed over / delivered / cancelled / payment received → buyer's phone. Tapping opens the order or the store's shipments.                                                                                                                                                                                                                                                                                                    |

Languages: Uzbek (Latin) and Russian, from the phone's language or the
user's choice. Light/dark mode follows the phone. Colours come from the same
design tokens as the website (`packages/ui/src/lib/tokens.ts`).

## How it talks to the API (security)

- Every request carries `X-UZGO-Client: mobile`; login returns an opaque
  session token in the body (never a cookie). The token is stored in the OS
  keystore (`expo-secure-store`) and sent as `Authorization: Bearer`. Logout
  revokes it on the server; "logout everywhere" revokes all sessions.
- Guest cart: `X-Cart-Token` header, merged into the account at login.
- Responses are validated with the shared Zod contracts (`@uzgo/contracts`);
  prices and totals always come from the server.
- Online payment opens Payme/Click in the system browser — card data never
  touches the app.
- Push tokens are bound to the session that registered them; push texts carry
  only the order/shipment number and status. Deep links are validated
  (`pushDataSchema`); anything else is ignored.
- Android permissions: internet, notifications, vibration. Microphone,
  storage and overlay permissions are removed from the build.

## Tests (no phone or emulator needed)

| Check                                                                               | Where                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------- |
| Unit tests (API client, i18n parity and plurals, formatting, variants, deep links)  | `pnpm --filter @uzgo/mobile test`, CI |
| Lint + strict typecheck                                                             | CI                                    |
| Full Android and iOS JavaScript bundles (`expo export`)                             | CI step "Bundle the mobile app"       |
| Buyer and seller flows rendered in Chromium (react-native-web) against the real API | `pnpm --filter @uzgo/mobile e2e`, CI  |
| Native project generation (`expo prebuild`) + release APK                           | "Mobile app" workflow (manual)        |

Not covered automatically: native modules on a real device (keystore, push
delivery, the system browser). Use the checklist below on a real phone before
each store release.

## Trying the app from a phone (no computer)

1. The API must be reachable over HTTPS (production or a staging server,
   RUNBOOK).
2. **Android**: GitHub → Actions → **Mobile app** → Run workflow → target
   `android-apk`, `api_url` = the server origin (e.g. `https://example.uz`).
   When it finishes, download the artifact `uzgo-android-…` (a zip with the
   APK) on the phone and install it (allow "install unknown apps" once). This
   APK is signed with a test key — for testing only, not for Google Play.
   Push notifications need the EAS setup below.
3. **iPhone/iPad**: Apple allows installs only through TestFlight/App Store:
   Apple Developer Program (paid, yearly) + EAS (below), then TestFlight.

## Store builds and push (owner accounts)

1. Expo account (free) → create the project, note the **project ID**; create
   an access token. GitHub → Settings → Environments → `mobile-release`:
   secrets `EXPO_TOKEN`, `EAS_PROJECT_ID`.
2. Android push: Firebase project → upload the FCM credentials to the Expo
   project (EAS credentials). iOS push: handled by EAS with the Apple account.
3. Optional: enable Expo push "enhanced security" and put the access token in
   the API as `EXPO_ACCESS_TOKEN`.
4. Google Play developer account (one-time fee); Apple Developer Program.
5. Actions → **Mobile app** → `eas-preview` (internal testing) or
   `eas-production` (store build; then submit from the Expo dashboard).

## Manual device checklist (before a store release)

- [ ] Install, first start in Uzbek and Russian phone language; dark mode.
- [ ] Browse, search, product with options, add to cart as guest.
- [ ] Login by SMS (real Eskiz), guest cart kept; app restart keeps the login.
- [ ] Checkout cash on delivery; checkout Payme/Click (sandbox) returns to the app and the order shows "Paid".
- [ ] Allow notifications; seller accepts the order → buyer gets a push; tapping opens the order.
- [ ] Seller phone gets "new shipment" push; accept → tracking → delivered.
- [ ] Logout → no more pushes on that phone; "logout everywhere" from another device.
- [ ] Airplane mode: screens show the retry state, nothing crashes.
