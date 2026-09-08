/* card.jsx
 *
 * @design approved 2026-09-06 — visible on the locked dashboard (the card shell under all of the above).
 *   The owner signed that page off and DESIGN-LANGUAGE was written from it.
 */

import { Card as UICard } from '@/components/ui/card';

export {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/* Card — PropVexis primitive.
 *
 * Keeps `ui.jsx`'s prop vocabulary (`hover`, `flush`) so a page migrates by
 * changing one import, and adds `spacing` because shadcn's Card drives ALL of its
 * internal rhythm from a single custom property.
 *
 * HOW THE SHADCN CARD MODEL DIFFERS FROM `.u-card`, since this is the substance of
 * the migration and not a detail:
 *
 *   .u-card          block, uniform 16px padding, 1px solid --line border
 *   shadcn Card      flex column, `gap-(--card-spacing)` between children,
 *                    VERTICAL padding only, and a ring + shadow instead of a border
 *
 * The gap is the part that surprises: children are spaced by the card, so a card
 * whose children already carry their own margins gets both.
 *
 * SO THE GAP IS OFF BY DEFAULT, and that is the single most important line in this
 * file. Every card in this app is written the legacy way — the card pads itself and
 * its children space themselves with margins (`.dash-activity-body` has
 * `margin-top: 16px`, `.jo-kpi-value` has `8px`, `.jo-section-title` has `12px`).
 * Inheriting the library's gap on top of those does not adjust the rhythm, it ADDS to
 * it: 16px became 32px on the Dashboard's activity and chart cards, and 8px became
 * 24px inside every Journal Overview KPI. Nobody wrote a number down wrong; two
 * spacing models were simply both active.
 *
 * `gap` opts back in, for a card whose children carry no margins of their own. New
 * cards should prefer it — one mechanism beats per-child margins — but it cannot be
 * the default while the pages are still on their own CSS (Phase 5), because the
 * default has to be "do not fight the stylesheet".
 *
 * WHY NOT JUST `spacing="none"` EVERYWHERE, which is what the KPI tiles do: because
 * `--card-spacing` drives padding AND the gap, so switching it off removes the card's
 * padding too. The KPI tiles get away with it only because their padding is restated
 * in legacy CSS. Splitting the two is what lets every other card keep the padding it
 * wants and the rhythm it already had.
 *
 * Horizontal padding is restored here (`px-(--card-spacing)`) because every card in
 * this app has always had it, and a surface with vertical-only padding is not a
 * card in our design language — it is a section divider.
 *
 * OVERFLOW IS NOT CLIPPED UNLESS THE CARD IS `flush`, and this one is a bug fix.
 * The library card sets `overflow-hidden` unconditionally, for one reason visible in
 * its own rules: so that an `<img>` as the first or last child clips to the card's
 * radius. This app has no images in cards. What it does have is in-flow
 * absolutely-positioned popovers — every `Explain` tooltip is a child of the label it
 * documents — and clipping silently swallowed them: the five KPI cards' tooltips
 * opened upward from the top edge into a hidden overflow and simply stopped
 * appearing. That is feature behaviour (A8), so it is a defect, not a visual diff.
 *
 * `flush` is where clipping genuinely belongs, and it already did: `.u-card--flush`
 * paired `padding: 0` with `overflow: hidden` precisely because a flush card holds
 * edge-to-edge content — a table, a chart — that has to be cut to the corner radius.
 * So the library's blanket clip becomes our existing flush semantics, and nothing
 * else clips. tailwind-merge resolves the conflict in our favour because our string
 * reaches the generated `cn()` as `className`, i.e. last.
 */

const SPACING = {
  // Tailwind's spacing base is var(--s-1) = 4px, so these land on our scale.
  none: '[--card-spacing:0px]',
  sm: '[--card-spacing:--spacing(3)]',   // 12px
  md: '[--card-spacing:--spacing(4)]',   // 16px — matches .u-card
  lg: '[--card-spacing:--spacing(5)]',   // 20px — the library default
};

function Card({ hover = false, flush = false, spacing = 'md', gap = false, className, ...rest }) {
  return (
    <UICard
      className={[
        /* THE CARD RADIUS IS THE ONE PLACE WE DEVIATE FROM THE PRESET (§6, owner
         * 2026-09-07). The whole `--radius-*` scale is the preset's now — 6/8/10/14/16/
         * 24/32 — and the generated card asks for `min(--radius-4xl, 24px)` = 24px.
         * Ours stays 14, which is what the dashboard was signed off at and what the
         * owner's mockup draws.
         *
         * It is pinned HERE and not in bridge.css deliberately: `dialog.jsx` and
         * `alert-dialog.jsx` read the same `--radius-4xl`, so capping the token would
         * have dragged every dialog back down to a card's roundness. A single deviation
         * belongs in the wrapper that owns it. */
        /* ── EXPERIMENT, 2026-09-08: THE CARD TAKES THE PRESET'S RADIUS ──────────────
         *
         * This line was `rounded-[var(--r-2xl)]` — 14px, our card step — and it was the
         * ONE place the app deviated from preset b2qLMFPP6 on radius. The generated card
         * asks for `min(--radius-4xl, 24px)` = 24px; letting it through is what this
         * change does, and it is a one-line change precisely because the deviation was
         * parked in this wrapper rather than in the bridge (see the note above: putting
         * it in the bridge would have dragged the dialog down with it).
         *
         * The owner asked to see it before deciding. TO REVERT: `git revert` the commit
         * that introduced this, or put the line back. `--r-2xl` itself is untouched at
         * 14px, so legacy overlays, the wizard's cards and everything else that reads the
         * token are unaffected — only the Card component moves.
         *
         * WHAT TO LOOK AT WHILE JUDGING IT:
         *   · The dashboard is almost entirely cards, so the whole page changes character.
         *   · The KPI tiles are the small end — a 24px corner on a ~150px-wide tile is a
         *     lot of curve, and they are where this will look most different.
         *   · It makes cards agree with the MODAL, which is already 24px. §6 says "an
         *     overlay is a card that floats", and right now card 14 / modal 24 / menu 16
         *     are three roundnesses for things that rule says should agree. This closes
         *     one of the two gaps.
         *   · The empty state was set to 10px earlier today as "a step inside the card's
         *     14". Inside 24 that gap is wider; worth a second look if this stays.
         *
         * IF IT STAYS this stops being an experiment and needs the rest of the ritual:
         * §6 is 🔒 LOCKED, so a kept change wants a DESIGN-LANGUAGE amendment recording
         * that the card exception is gone. */
        SPACING[spacing] ?? SPACING.md,
        // See the header: the card imposes no vertical rhythm unless asked, because
        // the pages' own CSS already supplies it via child margins.
        !gap && 'gap-0',
        // A card is padded on all four sides here; the library pads only vertically.
        // Clipping rides with `flush`, per the header — everything else must be free
        // to show a popover that overhangs its edge.
        flush ? '[--card-spacing:0px] overflow-hidden p-0' : 'overflow-visible px-(--card-spacing)',
        /* NO HOVER STATE (owner, 2026-09-07, preset parity). This carried
           `hover && 'transition-[box-shadow] hover:ring-foreground/20'` — a port of
           legacy `.u-card--hover`, which brightened the border, translated to brightening
           the ring the library card wears instead. The preset's card has no hover state
           at all, and NO CALLER IN THIS APP EVER PASSED `hover`, so the rule was carried
           forward from a vocabulary rather than from a need.
           The prop is still SWALLOWED rather than deleted: it stays in `ui.jsx`'s
           vocabulary (see the header), and a `hover` that fell through to `...rest` would
           reach the DOM as an unknown attribute and warn. It now does nothing, which is
           the preset's behaviour. */
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export { Card };
