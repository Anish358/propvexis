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
 * whose children already carry their own margins gets both. `spacing` exists to
 * control that in one place — `spacing="none"` turns the card back into a plain
 * padded surface, which is what a dense KPI tile wants.
 *
 * Horizontal padding is restored here (`px-(--card-spacing)`) because every card in
 * this app has always had it, and a surface with vertical-only padding is not a
 * card in our design language — it is a section divider.
 */

const SPACING = {
  // Tailwind's spacing base is var(--s-1) = 4px, so these land on our scale.
  none: '[--card-spacing:0px]',
  sm: '[--card-spacing:--spacing(3)]',   // 12px
  md: '[--card-spacing:--spacing(4)]',   // 16px — matches .u-card
  lg: '[--card-spacing:--spacing(5)]',   // 20px — the library default
};

function Card({ hover = false, flush = false, spacing = 'md', className, ...rest }) {
  return (
    <UICard
      className={[
        SPACING[spacing] ?? SPACING.md,
        // A card is padded on all four sides here; the library pads only vertically.
        flush ? '[--card-spacing:0px] p-0' : 'px-(--card-spacing)',
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
