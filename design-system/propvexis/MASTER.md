# PropVexis — Design System (MASTER)

> Source of truth for UI/UX. Every PR that touches the interface should read this
> first. Tokens live in [`frontend/src/styles.css`](../../frontend/src/styles.css) `:root`
> (the single reskin surface); JS/canvas parity in `frontend/src/theme.js`.
> A regression test (`test/design-tokens.test.js`) guards the color-role invariant.

## Brand
- **Name:** PropVexis · **Tagline:** *The Operating System for Traders.*
- **Personality:** Linear (minimal/fast) × Apple (clean/premium) × Stripe (modern) × TradingView (pro) × Notion (easy).
- **Values:** Precision · Discipline · Simplicity · Performance · Trust · Continuous Improvement.
- **Illustration:** simple, abstract, dark, geometric. No cartoon traders.

## The one rule (color roles)
> 🔵 **Blue = the product** (brand). 🟢 **Green** / 🔴 **Red = trade outcomes only.** 🟣 **Purple = AI / insight highlights only.**

Never color brand chrome green, and never color a non-outcome element green/red. This is
the invariant the token split enforces (`--accent*` = blue chrome, `--profit`/`--loss` = outcomes).

## Color tokens
Dark is the only shipped theme; tokens are named semantically so a future light theme is a
`:root[data-theme="light"]` override — no component CSS changes.

| Role | Token | Value | Notes |
|---|---|---|---|
| Background | `--bg` | `#0B0D12` | slight blue tint, not pure black |
| Surface | `--panel` / `--surface` | `#151922` | cards, panels |
| Surface raised | `--surface-2` | `#1C2130` | popovers, modals, cards-on-cards |
| Sidebar | `--sidebar-bg` | `#0A0C11` | |
| Hover | `--surface-hover` | `#1A1F2B` | |
| Border | `--line` | `#252B37` | visible divider on dark |
| Border strong | `--line-strong` | `#323949` | |
| Text | `--text` | `#F1F5F9` | off-white (avoids OLED halation); 17.7:1 |
| Text 2 | `--text-2` / `--muted` | `#94A3B8` | 6.9:1 |
| Text 3 | `--text-3` | `#64748B` | timestamps/hints |
| **Brand** (link/icon/active) | `--accent` | `#3B82F6` | 5.3:1 as text |
| **Brand** (button fill) | `--accent-strong` | `#2563EB` | white text 5.2:1 ✓ (bright blue fails at 3.7:1) |
| Brand tint bg / border | `--accent-bg` / `--accent-border` | `#12233F` / `#21396B` | |
| **Profit** | `--profit` | `#22C55E` | outcomes only; 7.7:1 |
| **Loss** | `--loss` | `#F87171` | text; `--loss-strong` `#EF4444` for fills |
| Break-even | `--be` | `#94A3B8` | |
| **AI / insight** | `--ai` | `#8B5CF6` | highlights only |
| Warning | `--warning` | `#F59E0B` | |
| Payout | `--payout` | `#38BDF8` | funded-account withdrawals |
| Status | `--status-good/warn/bad/info` | green/amber/red/`#7AA2F7` | Prop OS meters (+ status word, never color-alone) |

## Type
- **Sans (UI + headings):** Inter — `--font-sans` (`'Inter Variable'`, self-hosted via `@fontsource-variable/inter`).
- **Mono (prices / R / P&L):** JetBrains Mono — `--font-mono`, applied to numeric surfaces for tabular alignment.
- Scale: Display 32 / H1 24 / H2 20 / H3 16 / Body 14 / Small 13 / Caption 12. Line-height 1.5 body, 1.2 headings.

## Foundation scales
- **Radius:** `--r-sm 6` · `--r-md 8` · `--r-lg 12` · `--r-xl 16` · `--r-full`.
- **Space (4px grid):** `--s-1 4` … `--s-8 32`.
- **Shadow:** `--sh-1/2/3` (card / popover / modal).
- **Motion:** `--ease` `cubic-bezier(.16,1,.3,1)`, `--dur-fast 120ms`, `--dur 200ms`. Respect `prefers-reduced-motion` (global reset in place).
- **Z-index:** `--z-nav/dropdown/modal/toast`.
- **Icons:** Lucide-style outline SVG, `strokeWidth 2`, 18–24px. No emoji-as-icon, no colorful icons.
- **Focus:** global `:focus-visible` ring in `--accent` (keyboard only). Never remove it.

## Roadmap (phases)
- **Phase 0 — Foundation (DONE):** tokens, self-hosted fonts, brand↔outcome color split, leak sweep, shell reskin, a11y focus/reduced-motion.
- **Phase 1 — System components:** standardize Button/Input/Card/Modal/Table/Badge/Tabs on tokens; add skeleton + empty-state primitives.
- **Phase 2 — Build the `soon` modules** against the finished system.
- **Phase 3 — Polish:** motion, illustrations/empty-state art, onboarding, mobile, real logo/wordmark, optional light theme.

## Gaps tracked (not yet built)
Empty states · skeleton loaders · onboarding flow · mobile/responsive story for sidebar + dense tables · real logo (current wordmark uses a gradient placeholder mark) · light theme.
