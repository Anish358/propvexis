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
        SPACING[spacing] ?? SPACING.md,
        // See the header: the card imposes no vertical rhythm unless asked, because
        // the pages' own CSS already supplies it via child margins.
        !gap && 'gap-0',
        // A card is padded on all four sides here; the library pads only vertically.
        // Clipping rides with `flush`, per the header — everything else must be free
        // to show a popover that overhangs its edge.
        flush ? '[--card-spacing:0px] overflow-hidden p-0' : 'overflow-visible px-(--card-spacing)',
        // `.u-card--hover` brightened the border on hover. The library card has a
        // ring rather than a border, so the equivalent is to brighten the ring.
        hover && 'transition-[box-shadow] hover:ring-foreground/20',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export { Card };
