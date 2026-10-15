# 0016 — Seller onboarding, back office and staff TOTP (Phase 5)

- Status: Accepted
- Date: 2026-10-15
- Builds on: 0004/0013 (OTP + sessions), 0011 (security baseline), 0015 (orders)

## Decision

- **Seller onboarding:** any signed-in user can apply for a store (legal type,
  legal name, 9-digit STIR, contact phone — fields only, verified manually by
  staff). One pending application at a time, at most 3 stores per owner. A
  store is `PENDING → ACTIVE | REJECTED`, `ACTIVE ↔ SUSPENDED`. Approval grants
  `SELLER_OWNER`; moderators approve/reject, only admins suspend/reactivate.
- **Seller isolation:** every seller route is scoped by `storeId` and checks
  `StoreMember`; non-members get **404** (ids cannot be probed). Suspended or
  rejected stores are read-only. Owners manage staff (`SELLER_STAFF`); staff
  cannot manage the team.
- **Moderation:** content edits (title, description, category, attributes,
  images, new variants) send an `APPROVED` product back to `PENDING_REVIEW`;
  price, stock and availability changes apply immediately. Approval requires
  an active store. Decisions are conditional updates, so two moderators cannot
  both decide one submission.
- **Images:** multipart upload kept in memory (8 MB, one file), decoded and
  re-encoded to WebP by `sharp` (pixel limit, EXIF/GPS stripped, auto-rotate,
  max 1600 px); the client's type and name are ignored; keys are random.
- **Staff TOTP (RFC 6238, SHA-1, 6 digits, 30 s, ±1 step):** secrets are
  AES-256-GCM encrypted with `TOTP_ENCRYPTION_KEY`; replayed codes are refused
  (`lastUsedStep`); 5 wrong codes lock for 15 minutes. Verification is per
  session and lasts 12 hours. Every `/admin/*` route requires a staff role
  **and** a verified session (`@RequireStaffTotp`); `STAFF_TOTP_REQUIRED=false`
  is refused in production. A super admin can reset a lost factor (signs the
  person out everywhere). Admins no longer act on shipments through the seller
  route; they use `/admin/orders/...` behind TOTP.
- **Admin web:** the panel is hidden (404) from non-staff; the second-factor
  gate redirects to `/admin/security`. Next.js renders pages in parallel with
  layouts, so admin data fetches treat 401/403 as "nothing to show" — the API
  is the real gate.

## Alternatives considered

- WebAuthn/passkeys for staff: stronger, but needs HTTPS origins and device
  management UI; planned as an addition before production scale-up.
- QR code rendering for enrolment: adds a dependency; the `otpauth://` link and
  the grouped key are enough on a phone.

## Consequences

`sharp` (libvips, prebuilt binaries) is a new runtime dependency of the API.
A test-only `/__test__/grant-role` endpoint exists for browser e2e; like
`/__test__/last-otp` it answers 404 unless `NODE_ENV=test` and
`SMS_PROVIDER=fake`. Browser e2e also sets `RATE_LIMIT_DISABLED=true` (every
login comes from 127.0.0.1); env validation refuses it unless `NODE_ENV=test`,
and the database-backed OTP limits still apply.
