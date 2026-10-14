# 0012 — Design system and web i18n (Phase 2)

- Status: Accepted
- Date: 2026-10-14

## Context

Phase 2 needs a premium, original, accessible UI in Uzbek (Latin) and Russian,
fast on mid-range phones, maintainable by one team.

## Decision

- **Tokens:** CSS variables in `packages/ui/src/styles/tokens.css`, mapped to
  Tailwind 4 theme names; light on `:root`, dark on `.dark`. Palette: deep blue
  primary + green accent (values and measured contrast in DESIGN_SYSTEM.md).
- **Font:** Onest Variable, self-hosted via fontsource (glyph coverage for
  ʻ ʼ and Uzbek Cyrillic verified with fontTools). No third-party font requests.
- **Components:** shadcn/ui pattern (copied, owned code) on the `radix-ui`
  primitives package, `class-variance-authority`, `clsx` + `tailwind-merge`,
  `lucide-react` icons, `sonner` toasts. `packages/ui` ships TypeScript source;
  the web app transpiles it (`transpilePackages`).
- **Theme:** own 1-line inline script + toggle instead of a theme library.
- **i18n:** `next-intl` with `/uz` and `/ru` prefixes (`localePrefix: always`),
  default `uz`, `src/proxy.ts` for locale redirects. The locale is read with
  `next/root-params` (next-intl deprecated `setRequestLocale`/`requestLocale`).
  UI strings live in `apps/web/messages/{uz,ru}.json`; a test enforces equal
  keys and correct Uzbek ʻ/ʼ characters; ESLint `react/jsx-no-literals` blocks
  hardcoded JSX text. Catalog content (product names) carries its own
  per-locale values, as the database will.
- **Rendering:** homepage, cart, account and info pages are statically
  generated per locale. Only `search` and `status` render per request and have
  their own `loading.tsx` — a locale-wide loading boundary would stream before
  `notFound()` and turn real 404s into 200s (caught by an e2e test).
- **Fixture data** lives in `apps/web/src/fixtures` and every place that shows
  it is labelled "Demo". "Add to cart" only shows an honest "coming soon" toast.
- **Testing:** Vitest + Testing Library (jsdom) for components; Playwright at
  360/768/1280 for uz and ru, and axe (WCAG 2.2 AA) in light and dark themes.
- `output: 'standalone'` was removed for now (it conflicts with `next start`
  used by e2e); it returns with the Dockerfile in Phase 7.

## Consequences

New UI text must be added to both message files (tests fail otherwise).
Adding a locale = add it to `routing.ts` and a messages file.
