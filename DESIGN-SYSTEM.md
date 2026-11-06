# Design system

Reference pages: `/` (catalog) and `/cart`. Their style is intentional and is the source of truth.

## Language
| Token | Rule |
|---|---|
| Actions, chips, search, toggles | Pills: `rounded-full` (`.btn`, `.chip`) |
| Surfaces (cards, notices, list rows) | `rounded-2xl` (`.card`, `.notice`) |
| Home catalog cards, sort popover, empty state | Extra round: `rounded-[32px]` / `rounded-[28px]` |
| Inputs | `rounded-xl` (`.input`); search and sort select are pills |
| Page title | `.page-title` (30/36px, bold, -0.045em); admin and dev use `.page-title-sm` |
| Page shell | `mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10` |
| Colour | Only tokens: `ink`, `paper`, `accent`, `ok`, `warn`, `bad`, `nav`. No raw black/white outside the header |
| Active toggle | `bg-ink text-paper` (flips automatically in dark mode) |

## Rules
1. Server components never pass functions or components to client components. Pass data, for example an icon *name*. `SectionNav` resolves names to Lucide icons.
2. New filters and tabs use `.chip` / `.chip-on`, not bespoke bordered boxes.
3. New banners use `.notice` or the `rounded-2xl border border-{accent|warn}/40` variant.
4. Do not edit `/` or `/cart` styling when changing shared primitives.

## Open items
- `components/site/header-navigation.tsx` uses `text-white` / `bg-white` / `bg-black` on purpose (the nav is a fixed-dark pill). Consider `nav-ink` tokens if the nav is ever themed.
- Chart colours (`--viz-*`) are separate from UI tokens by design.
- `/shop` renders the same `Catalog` as `/`, so it picked up the rounder cards too.
