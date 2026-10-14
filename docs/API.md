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
`Retry-After`. In-memory first; Redis only via ADR.

## Health

- `GET /api/v1/health/live` → `200 { "status": "ok" }` when the process runs.
- `GET /api/v1/health/ready` → `200` when the DB is reachable, otherwise `503`.

## Versioning of contracts

`packages/contracts` is the single source of truth. A typed client generated
from OpenAPI is introduced in Phase 4; until then the web uses a thin typed
fetch wrapper over the same Zod schemas.
