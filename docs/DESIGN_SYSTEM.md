# DESIGN SYSTEM

Status: **values final for Phase 2** (implemented in `packages/ui`). Brand
colours and wordmark are the owner-approved direction "deep blue + green";
a designer's logo can replace the wordmark later without code changes.

## Brand brief (from the owner)

- Style: modern, clean, premium, mobile-friendly.
- Mood: trustworthy, fast, bright — but not excessive.
- Light **and** dark mode.
- Logo: text wordmark "UZGO" for now.
- Feel references only (nothing copied): large regional marketplaces for
  convenience, Apple for restraint and typography, Airbnb for warmth.
- Original identity. Purple and bright yellow are avoided as primary colours
  because they are the signature colours of existing marketplaces.

## Owner's visual references (2026-10-14)

The owner shared reference shots (feel only — no assets, names or layouts
copied):

- **Marketplace web** (blue, clean): left category sidebar next to a large hero,
  side promo cards, a benefits strip, colourful category tiles, white bordered
  product cards with an add-to-cart action. → Implemented on the homepage.
- **Super-app** (playful 3D illustrations, service grid): one place for all
  services. → "UZGO xizmatlari" grid with original flat illustrations
  (Market live; Yetkazish, Go, Food labelled "Tez kunda", non-interactive).
- **Ride-hailing app** (green, map-first, bottom sheets) and **food delivery
  apps** (photo-led cards, warm accents). → Direction for the future Go and
  Food modules and the mobile apps (Phase 8–9); our green accent and bottom
  `Sheet` component already fit that pattern.

## Illustrations

Original flat SVGs in `apps/web/src/components/art` (MarketArt, DeliveryArt,
GoArt, FoodArt — a plov lagan — and HeroArt). Brand blue/green plus warm
yellow/orange accents, always `aria-hidden`. Category tiles and demo product
images use per-category pastel tints (`lib/category-style.ts`) with icons
until real product photos arrive in Phase 4.

## Principles

1. Mobile-first: designed at 360px, then 768px and 1280px+.
2. Content first: product images and prices dominate; chrome stays quiet.
3. Speed is a feature: static rendering where possible, skeletons, no layout shift.
4. Trust cues: clear prices in soʻm, seller name, honest "Demo"/"Tez kunda" labels.
5. Accessible: WCAG 2.2 AA contrast (checked), visible focus, keyboard navigable,
   touch targets ≥ 44px for primary controls, `prefers-reduced-motion` respected.
6. Every screen has loading, empty, error and success states.
7. Bilingual by design: layouts tolerate longer Russian strings; Uzbek ʻ ʼ render correctly.
8. Restraint: one primary action per view; accents used sparingly.

## Wordmark

`<Logo />` — "UZ" in `primary` + "GO" in `brand-go`, Onest 800, tracking −0.04em.
Exposed to assistive tech as one image named "UZGO". Banner art uses an
original "motion lines + ring" motif (the "GO" idea).

## Colour tokens

Components use semantic tokens only (`bg-primary`, `text-muted-foreground`, …).
Defined in `packages/ui/src/styles/tokens.css`.

| Token                  | Light                 | Dark                  | Use                          |
| ---------------------- | --------------------- | --------------------- | ---------------------------- |
| `background`           | `#ffffff`             | `#0c1018`             | page                         |
| `foreground`           | `#151a25`             | `#edeff3`             | body text                    |
| `card` / `popover`     | `#ffffff`             | `#151a25`             | surfaces                     |
| `muted`                | `#f3f5f8`             | `#1c2230`             | subtle fills, inputs         |
| `muted-foreground`     | `#5a6376`             | `#a3abbb`             | secondary text               |
| `border`               | `#dde1e8`             | `#2a3142`             | dividers                     |
| `input`                | `#8a93a6`             | `#5c6579`             | form control borders (≥ 3:1) |
| `primary` (deep blue)  | `#143c8f`             | `#86acf2`             | main actions, links          |
| `primary-foreground`   | `#ffffff`             | `#0a1f4d`             | text on primary              |
| `secondary`            | `#e8effd`             | `#1b2a4d`             | soft buttons, icon tiles     |
| `secondary-foreground` | `#143c8f`             | `#d0defa`             |                              |
| `accent` (green)       | `#047a4e`             | `#3dd093`             | seller / positive actions    |
| `accent-foreground`    | `#ffffff`             | `#0c1018`             |                              |
| `brand-go`             | `#059862`             | `#3dd093`             | wordmark "GO" only           |
| `sale`                 | `#c2410c`             | `#fb8b5b`             | discount badges              |
| `success` / `warning`  | `#047a4e` / `#b45309` | `#3dd093` / `#f5b454` | status                       |
| `destructive`          | `#c42b32`             | `#f2777c`             | errors                       |
| `ring` (focus)         | `#2c63d6`             | `#7aa3f0`             | focus outline                |

Measured contrast (WCAG): text on background 17.4 (light) / 16.5 (dark);
muted text ≥ 5.5 / 7.5; primary button text 10.1 / 7.0; accent button 5.4 / 9.7;
sale badge 5.2 / 8.1; input borders 3.1 / 3.3. Banner gradients keep white
text ≥ 4.5:1. axe (WCAG 2.2 AA) passes on the homepage in both themes (CI).

## Typography

- Family: **Onest Variable** (SIL OFL, self-hosted via `@fontsource-variable/onest`,
  no requests to Google). Verified glyph coverage: ʻ U+02BB, ʼ U+02BC, Cyrillic
  incl. Ўў Ққ Ғғ Ҳҳ. Inter also covers them and is the documented alternative;
  Manrope and Golos were rejected (missing ʻ/ʼ or Uzbek Cyrillic letters).
- Fallback: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`.
- Scale (Tailwind): `text-xs` 12 · `sm` 14 · `base` 16 · `lg` 18 · `xl` 20 ·
  `2xl` 24 · `3xl` 30 · `4xl` 36. Weights 400/500/600/700/800.
- Inputs are 16px on mobile (prevents iOS zoom). Prices use `tabular-nums`.

## Spacing, radius, elevation, motion

- Spacing: Tailwind 4px scale; page gutter 16px; content max width 1280px (`max-w-7xl`).
- Radius: `sm` 6px · `md` 10px · `lg` 14px · `xl` 20px.
- Shadows: `sm`, `md`, `lg`, `xl` built from `--shadow-color` (softer/darker in dark mode).
- Motion: `fast` 120ms, `base` 200ms, `slow` 320ms; easings `standard`
  `cubic-bezier(0.2,0,0,1)`, `emphasized` `cubic-bezier(0.3,0,0,1.15)`;
  animations: fade, zoom (dialog), slide-left (sheet), slide-bottom. All
  disabled under `prefers-reduced-motion`.
- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280);
  verified at 360 / 768 / 1280.

## Theme

`.dark` class on `<html>`. A tiny inline script applies the saved choice
(`localStorage["uzgo-theme"]`) or the system preference before paint; the
header toggle switches and saves it. (When the nonce-based CSP arrives in
Phase 7 this script gets the nonce.)

## Components (`packages/ui`)

Built on shadcn/ui patterns with Radix primitives, Tailwind and
`class-variance-authority`. All user-visible text is passed in by the app
(translated), never hardcoded in the package.

| Component   | Notes                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Button      | variants primary/accent/secondary/outline/ghost/destructive/link; sizes sm/md/lg/icon; `asChild` |
| Input       | 44px, 16px text on mobile, `aria-invalid` styling                                                |
| Select      | Radix Select, keyboard and screen-reader accessible                                              |
| Badge       | primary/secondary/accent/sale/outline/muted                                                      |
| Card        | Card, Header, Title, Description, Content, Footer                                                |
| ProductCard | price (tiyin → soʻm), old price + discount, store, image slot, action slot                       |
| ServiceCard | "coming soon" card — deliberately not interactive                                                |
| Dialog      | Radix Dialog, translated close label required                                                    |
| Sheet       | side/bottom panel on Radix Dialog                                                                |
| Toast       | `Toaster` + `toast()` (sonner), polite announcements                                             |
| Skeleton    | hidden from assistive tech                                                                       |
| EmptyState  | `role=status`, or `role=alert` for errors                                                        |
| Pagination  | accessible nav with `aria-current`, pluggable link component                                     |
| Logo, Price | wordmark; `formatPrice()` → `12 500 soʻm` / `12 500 сум` (NBSP)                                  |

Web-app components (in `apps/web`): SiteHeader (logo, search, language,
theme, account, cart), CategoryNav + CatalogSheet, MobileBottomNav, SiteFooter,
LocaleSwitcher (keeps path and query), ThemeToggle, homepage sections.

## Still open (owner)

- Final logo by a designer (optional); colours can be tuned only via tokens.
