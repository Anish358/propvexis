/* Badge — PropVexis primitive.
 *
 * ON THE GENERATED COMPONENT SINCE 2026-09-07 (owner). This file used to hold the OLD
 * implementation on purpose — `.u-badge` plus six `.u-badge--<tone>` rules — and the
 * header argued the case at length: our vocabulary is a `tone`, and four of its six
 * values are domain colours the registry has nothing for.
 *
 *     neutral  brand  |  profit  loss  warn  ai
 *     ----------------    -----------------------
 *     library has these   library has NOTHING for these
 *
 * shadcn knows `destructive`; it does not know that a losing trade is not a failed
 * action, that a winning one is not a success toast, or that `ai` is its own semantic.
 * The old note concluded that mapping the two it does have and leaving four on legacy
 * would give one component TWO styling systems, and that was right.
 *
 * THE OWNER RESOLVED IT THE THIRD WAY: keep the six-value `tone` API and implement all
 * six here, in Tailwind, on the generated component. So there is still one styling
 * system — it is just ours rather than the registry's, for the four the registry cannot
 * name. `.u-badge` and its six rules are DELETED from legacy/app.css in the same change;
 * this is the standing rule working as intended, not an exception to it.
 *
 * WHAT CHANGED VISUALLY, because it is not nothing and no test can see it. The legacy
 * rule drew `font: 600 11px/1` in a fully-round pill. The generated badge is `h-5
 * rounded-2xl px-2 text-xs font-medium` — 12px at weight 500, radius 16px on a 20px
 * pill, so still effectively round. Every badge in the app therefore gets one step
 * larger, one step lighter and a hair less round. That is the preset's shape, which is
 * the point of the move; it is called out here because "migrate to shadcn" reads like a
 * no-op and this one is not.
 *
 * THE COLOURS ARE NO LONGER THE LEGACY RULE'S. The first pass off legacy transcribed the
 * six deleted `.u-badge--*` declarations token for token, including a `--tint-warn-4`
 * background and a `--tint-ai-2` border replaced with same-formula siblings. All of that
 * is superseded: the tone map below is the PRESET's recipe, and the two replacement
 * tokens were deleted again rather than left orphaned. See the map for the three ways the
 * transcription differed from what shadcn actually draws.
 *
 * THE BASE VARIANT IS CHOSEN PER TONE, as the preset's own demo does. `neutral` renders
 * `variant="secondary"` with no classes at all, because that IS the preset's neutral
 * badge. The five hues render `variant="default"` plus a fill and a text colour, exactly
 * like `BadgeCustomColors`, and `cn()` is tailwind-merge so each DELETES the variant's
 * own `bg-`/`text-` rather than racing it on specificity. Neither path touches the
 * border: the generated base is `border border-transparent` and the preset never
 * overrides it, so a badge has no edge in either case.
 *
 * The variants also carry `[a]:hover:` rules; the generated Badge renders a `<span>` by
 * default (`useRender`, `defaultTagName: "span"`), so those selectors never match and are
 * left alone rather than fought.
 *
 * `badgeVariants` is deliberately not re-exported. Callers speak `tone`, and exporting
 * the registry's variant vocabulary alongside it would invite a second Badge.
 *
 * @design approved 2026-09-07 — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */
import React from 'react';
import { Badge as UIBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/* tone: neutral | brand | profit | loss | warn | ai
 *
 * THE PRESET'S RECIPE, NOT THE LEGACY RULE'S (2026-09-07, second pass). The first pass
 * off legacy transcribed the six deleted `.u-badge--*` declarations token for token:
 * a 13% translucent wash, the structural hue as text, and a 30% coloured BORDER. Put
 * beside the preset's own custom-colour badges that is three differences, and the owner
 * pasted the source that settles all three:
 *
 *     <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
 *
 *   FILL      an opaque `-950`, not a 13% wash of the hue over whatever is behind.
 *   TEXT      the `-300` step, a light tint of the same hue.
 *   BORDER    NONE. The generated base is `border border-transparent` and the demo
 *             never overrides it, so the coloured edge was ours alone.
 *
 * `variant="secondary"` is the base for `neutral` because that IS the preset's neutral
 * badge; the five hues take `default` plus a fill and a text colour, exactly as the demo
 * does, and `cn()` is tailwind-merge so each DELETES the variant's own bg/text rather
 * than racing it. The transparent border comes free from the base either way.
 *
 * The `--badge-tint-*` values are derived in tokens.css from the hue we already own -
 * see the note there for why five Tailwind `-950` literals were not imported instead. */
const TONES = {
  neutral: null,
  brand: 'bg-[var(--badge-tint-brand)] text-[var(--blue-400)]',
  profit: 'bg-[var(--badge-tint-profit)] text-[var(--profit-bright)]',
  loss: 'bg-[var(--badge-tint-loss)] text-[var(--loss-bright)]',
  warn: 'bg-[var(--badge-tint-warn)] text-[var(--warning-bright)]',
  ai: 'bg-[var(--badge-tint-ai)] text-[var(--purple-400)]',
};

function Badge({ tone = 'neutral', className, children, ...rest }) {
  const tint = TONES[tone] ?? null;
  return (
    <UIBadge
      variant={tint ? 'default' : 'secondary'}
      className={cn(tint, className)}
      {...rest}
    >
      {children}
    </UIBadge>
  );
}

export { Badge };
