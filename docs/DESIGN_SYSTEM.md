# DESIGN SYSTEM (principles — values finalised in Phase 2)

## Brand brief (from the owner)

- Style: modern, clean, premium, mobile-friendly.
- Mood: trustworthy, fast, bright — but not excessive.
- Light **and** dark mode.
- Logo: none yet → simple text wordmark "UZGO".
- Feel references (feel only, nothing copied): large regional marketplaces for
  convenience, Apple for restraint and typography, Airbnb for warmth and
  clarity.
- Must be original. Do not reuse any other company's colours, logo, layout or
  assets. In particular avoid the signature colours of the main competing
  marketplaces in Uzbekistan (purple, bright yellow) as the primary brand colour.

## Colour proposal (owner confirms in Phase 2)

Working direction: **deep blue + fresh green**.

- Deep blue (trust, premium) as primary: around `#0B3D91`–`#123C8C` family.
- Fresh green (speed, "go", positive actions) as accent: emerald family.
- Warm accent for discounts/badges only (coral/orange), used sparingly.
- Neutral greys slightly cool; pure white surfaces in light mode,
  near-black blue-grey surfaces in dark mode (not pure black).
  Exact values, contrast checks (WCAG AA ≥ 4.5:1 text, 3:1 UI) and dark-mode
  pairs are fixed in Phase 2.

Alternatives the owner mentioned: purple (rejected — too close to an existing
marketplace), dark orange (possible as accent instead of primary).

## Wordmark proposal

- "UZGO" in a geometric sans, bold, slightly tight letter spacing.
- "GO" coloured with the green accent, "UZ" in deep blue (inverted in dark mode).
- Optional small forward chevron/arrow cue in the "O" later — only if it stays
  simple. Final logo by a designer can replace it without code changes
  (logo is a component).

## Principles

1. Mobile-first: designed at 360px, then 768px and 1280px+.
2. Content first: product photos and prices dominate; chrome stays quiet.
3. Speed is a feature: skeletons, no layout shift, small JS, optimised images.
4. Trust cues: clear prices in soʻm, seller name, delivery estimate, returns info.
5. Accessible: WCAG AA contrast, visible focus, keyboard navigable, 44px touch targets.
6. Every screen has loading, empty, error and success states.
7. Bilingual by design: layouts tolerate longer Russian strings; Uzbek ʻ ʼ render correctly.
8. Restraint: one primary action per view; colour accents used sparingly.

## Token categories (values in Phase 2, implemented in `packages/ui`)

| Category           | Contents                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour             | brand (primary, accent), semantic (success, warning, danger, info), neutrals, surfaces, text, border, focus ring — each with light and dark values                                  |
| Typography         | font families (must cover Uzbek Latin incl. ʻ U+02BB, ʼ U+02BC, and Cyrillic — e.g. Inter, Manrope or Golos-like candidates, checked in Phase 2), size scale, weights, line heights |
| Spacing            | 4px base scale                                                                                                                                                                      |
| Radius             | sm / md / lg / full                                                                                                                                                                 |
| Shadow / elevation | 3–4 levels, softer in dark mode                                                                                                                                                     |
| Motion             | durations, easings; respects `prefers-reduced-motion`                                                                                                                               |
| Breakpoints        | 360, 768, 1024, 1280                                                                                                                                                                |
| Z-index            | header, sheet, dialog, toast                                                                                                                                                        |

## Component inventory

- Primitives: Button, IconButton, Input, PhoneInput (+998), Select, Checkbox,
  Radio, Switch, Textarea, Label, Badge, Tooltip.
- Feedback: Toast, Skeleton, Spinner, EmptyState, ErrorState, Alert.
- Overlays: Dialog, Sheet (mobile bottom sheet), Dropdown menu.
- Cards: ProductCard, StoreCard, ServiceCard ("Tez kunda / Скоро", non-interactive), CategoryTile.
- Navigation: Header (logo, search, language UZ/RU, account, cart), CategoryMenu,
  MobileBottomNav, Breadcrumbs, Pagination, Tabs.
- Commerce: Price (formats tiyin → `12 500 soʻm` / `12 500 сум`), QuantityStepper,
  VariantPicker, CartLine, OrderStatusBadge.
- Layout: Container, Grid, Footer, ThemeToggle.

Based on shadcn/ui (Radix primitives) + Tailwind CSS, themed via CSS variables.
