/* empty-state.jsx
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import React from 'react';
import {
  Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

/* EmptyState — PropVexis primitive.
 *
 * The canonical "nothing here yet" / coming-soon block. Fifteen call sites, and the API
 * — `{ icon, title, description, actions, badge, className }` — is unchanged, so this
 * rebuild moved one file and no callers. That is the whole promise of this seam.
 *
 * ── REBUILT OFF LEGACY CSS ON 2026-09-08, ON A CLAIM THAT HAD GONE STALE ─────────────
 *
 * This file argued, at length, that it would stay hand-written: "NOT LIBRARY-BACKED, AND
 * WON'T BE SOON. Presets ship components, not states — no registry has an empty state,
 * because what belongs in one is a product decision."
 *
 * It contradicted its own status line two paragraphs above, which already said "replace
 * with `@shadcn empty` (EmptyMedia/Title/Description/Content)" — and the registry does
 * ship exactly that, with exactly those parts. Fourth expired justification found in this
 * layer during the review. The argument was even half right and that is what made it
 * durable: what BELONGS in an empty state is a product decision, and it still is. What
 * the registry settles is the ARRANGEMENT, which was never the disputed part.
 *
 * WHAT MOVED, so it can be judged rather than discovered:
 *
 *   · The icon box was 52px on `--surface-2` with a 1px border and the button radius.
 *     `EmptyMedia variant="icon"` is 40px on `--muted` with no border and `rounded-xl`.
 *   · The title was 17px and the description 13px. NEITHER IS ON THE TYPE SCALE — the
 *     steps are 12/14/16/18/24 — so they were literals predating it. They are now
 *     `text-lg` (18) and `text-sm` (14), which is the rebuild picking up a scale the app
 *     already agreed on rather than a restyle.
 *   · Padding went from 48/24 to a uniform p-12, and the max width from a hand-set 460px
 *     to the registry's `max-w-sm` on the header and content.
 *
 * `border-dashed` COMES FROM THE REGISTRY AND DRAWS NOTHING, deliberately left as it
 * arrived: the generated Empty sets a border STYLE and no border WIDTH, so it is inert
 * until a caller asks for one. §4 files a dashed edge under empty states, so the day one
 * is wanted it is `border` at the call site and not a new component.
 */

/* IT FADES IN, and this is the one surface where a pure entrance animation is easy to
 * justify. An empty state has NO FIGURES TO READ — that is its definition — so the
 * objection that applies everywhere else on this dashboard (motion in front of a number
 * delays reading it) has nothing to bite on. It is also rare: a trader sees this once, on
 * a screen that would otherwise appear as a bare box, where arriving deliberately reads
 * as designed rather than as failed to load.
 *
 * ONE FADE, NO TRAVEL. §2 keeps layout an invariant, and an empty state that slides is a
 * product apologising for having nothing to show.
 *
 * `--dur` and the shared pv-content-in keyframe, so this cannot drift from the other
 * arrivals — the same one BriefSection and PageEntrance use. */
const ENTRANCE = 'animate-[pv-content-in_var(--dur)_var(--ease)_backwards]';

function EmptyState({ icon, title, description, actions, badge, className }) {
  return (
    <Empty className={cn(ENTRANCE, className)}>
      {badge}
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
        {title ? <EmptyTitle>{title}</EmptyTitle> : null}
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {actions ? (
        /* The registry stacks its content column; the app's empty states put one or two
           buttons SIDE BY SIDE, which is what `.u-empty-actions` did (`flex; gap: 12px;
           flex-wrap: wrap; justify-content: center`). Restated here rather than at each
           of the fifteen call sites. */
        <EmptyContent className="flex-row flex-wrap justify-center gap-3">
          {actions}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export { EmptyState };
