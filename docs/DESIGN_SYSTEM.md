# Design system

Direction: minimal, premium, calm, precise. Dark theme, flat surfaces, bright
ink, one restrained violet accent, thin borders. No gradients as decoration
(heatmap data colors and the tasteful skeleton shimmer are the only
exceptions), no glassmorphism, no oversized type.

## Tokens (`apps/dashboard/src/index.css`)

| Token group | Values |
|---|---|
| Canvas / surfaces | `#0E1014` canvas, `#16191F` cards, `#1F232C` soft, `#232839` slate tint |
| Ink | `#E9EBF1` primary, `#C6CBD6` soft, `#9AA1B0` muted, `#6E7482` faint |
| Accent | `#7C74FF` violet, `#9A92FF` active, `rgba(124,116,255,0.16)` tint |
| Semantic | `#169B62` positive, `#E99A31` warning, `#D9485F` danger (+ tints) |
| Heat | `#35C7F4` low → `#55E28A` → `#FFE45B` → `#FF6B4A` hot |
| Type | Inter stack; 12 / 13 / 14 / 16 / 20 / 22 px scale |
| Radius | 6px chips · 8px controls · 12px cards · 14px panels · pill only for badges |
| Layout | 220px sidebar, 1680px max content, 30px desktop padding |

Structure comes from borders and spacing; shadows are a barely-there
`0 1px 2px` hairline. Focus is a 2px violet ring.

## Components

- **Sidebar** (220px, icon rail ≤1024px, drawer + backdrop ≤720px): tinted
  active item with a 2px accent edge and semibold label — never colorful icons.
- **Top bar**: title, API status chip, date-range control. Compact; nothing
  decorative.
- **KPI cards**: label, 20px value, optional neutral footnote. No sparklines
  unless backed by data (the Activity panel carries the one real chart).
- **Tables**: uppercase 12px headers, row hover, selected-row tint, horizontal
  scroll on small screens instead of crushed columns.
- **Timeline**: 12px markers — violet for page views, green for clicks —
  with a hairline connector; coordinates as monospace chips.
- **Heatmap**: page/device/display controls, total + device breakdown, labeled
  schematic layout preview (explicitly not a screenshot), intensity legend.
- **States**: shimmer skeletons preserve layout while loading; empty states
  explain the next action; errors name the failing panel and offer retry.
- **Motion**: 150–200ms ease on hover/drawer only. Nothing floats or bounces.

## Rules for new UI

1. Every visible number must come from the API (or be labeled as a demo seed).
2. Every control must do something; no placeholder links or dead buttons.
3. Prefer text + border over icon + shadow.
4. One accent color; green/orange only for status and heat data.
