# PERFORMANCE

## Lighthouse, mobile (Phase 7, 2026-10-15)

Lighthouse 13.5.0, default mobile profile (Moto G-class device, simulated slow
4G, 4× CPU slowdown), headless Chromium, against the production build
(`next build`, standalone server) with the demo data, run locally in the cloud
session. No CDN or HTTP/2 here; production adds Caddy (zstd/gzip, HTTP/2–3).

| Page                  | Performance | Accessibility | Best practices | SEO\* | FCP   | LCP   | TBT    | CLS   |
| --------------------- | ----------- | ------------- | -------------- | ----- | ----- | ----- | ------ | ----- |
| `/uz` (home)          | 89          | 100           | 100            | 66    | 1.4 s | 3.6 s | 140 ms | 0     |
| `/uz/catalog`         | 92          | 100           | 100            | 63    | 1.4 s | 3.1 s | 110 ms | 0     |
| `/uz/p/kok-choy-100g` | 91          | 100           | 100            | 58    | 1.4 s | 3.3 s | 110 ms | 0     |
| `/uz/cart`            | 96          | 100           | 100            | 63    | 1.4 s | 2.7 s | 90 ms  | 0.019 |
| `/uz/login`           | 97          | 100           | 100            | 63    | 1.0 s | 2.4 s | 120 ms | 0.004 |
| `/ru`                 | 94          | 100           | 100            | 66    | 1.5 s | 2.9 s | 100 ms | 0     |

\* SEO is low **on purpose**: indexing is off until launch (`noindex`,
`PUBLIC_INDEXING=false`), and the local run used a placeholder site URL for
canonical links. Both are configuration, not code.

Fixed during the review: missing favicon (console 404) and a CSP report caused
by Zod probing `eval` (now `jitless` in the browser) — best practices 92 → 100.

Remaining opportunity: LCP is the hero heading, delayed by render-blocking CSS
and the web font (~430 ms estimated); total transfer ≈ 362 KB. Candidates when
needed: preloading only the Latin/Cyrillic font subsets in use, trimming
unused JavaScript (~50 KB estimated), and caching category/product data at
the proxy. Re-measure on the real server and domain after launch.

How to re-run: build (`pnpm build`), start the API and
`node apps/web/.next/standalone/apps/web/server.js`, then
`npx lighthouse@<version> <url> --form-factor=mobile` (not a project dependency).
