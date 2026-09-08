/* empty-state.jsx
 *
 * @design approved 2026-09-08 — owner signed off Batch 6 (Rebuilt, then reviewed) as a
 *   family on the Test page. These three were rebuilt off legacy CSS the same day and
 *   reviewed as the rebuild, not as what preceded it. See test/primitives-status.test.js.
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
 * ── THE DASHED EDGE, AND THE NOTE THAT WAS WRONG ABOUT IT (2026-09-08) ────────────────
 *
 * This said: "`border-dashed` COMES FROM THE REGISTRY AND DRAWS NOTHING, deliberately
 * left as it arrived: the generated Empty sets a border STYLE and no border WIDTH, so it
 * is inert until a caller asks for one."
 *
 * TRUE OF SHADCN'S INSTALL, FALSE OF OURS, and the owner saw the difference immediately —
 * a thick WHITE dashed box where the reference shows a faint grey one. `border-style`
 * with no width is inert only because preflight has already zeroed the width, and we do
 * not import preflight (tailwind.css says why: it would restyle every legacy page). So
 * the style landed on the UA default `medium` width and `currentColor`. Reading the
 * registry source is not the same as knowing what it does HERE.
 *
 * Fixed at the root — bridge.css now zeroes border-width for every `[data-slot]` element,
 * which is what preflight would have done and what that file already did for buttons
 * alone. So `border-dashed` is inert here now, exactly as upstream assumes.
 *
 * AND THE EDGE IS THEN ASKED FOR EXPLICITLY, because an empty state should have one:
 * shadcn's own examples draw it, and this app already has the convention in two approved
 * primitives — `account.jsx` and `brief.jsx` both write `border border-dashed
 * border-[var(--line-strong)]` for exactly this. `--line-strong` is the token §4 names
 * for it ("THE standard visible border — dashed empties, separators"), so this is the
 * app's settled answer rather than a third opinion about what a dashed edge looks like.
 */
/* ── AND THE CORNER, WHICH THE OWNER SAW BEFORE I DID (2026-09-08) ───────────────────
 *
 * "At corner i see some uneven in ours." They were right, and the cause is not a
 * rendering artefact — the registry asks for a radius this app does not use.
 *
 * THE PRINCIPLE HELD; EVERY NUMBER IN IT MOVED (owner, 2026-09-09). The rule chosen that
 * day was right and is kept: an empty state fills a CARD's body, so it must sit ONE STEP
 * INSIDE the card containing it — an inner curve that bulges past the outer one is what
 * reads as uneven. But the ladder shifted the next day and the step that satisfied it
 * changed:
 *
 *                              8 Sep      9 Sep
 *     the card                 14px       24px    <- moved
 *     one step inside it       10px       18px    <- so this moved too
 *     account.jsx dashed       12px       18px    (--r-xl, tracked the ladder)
 *     brief.jsx dashed note    10px       14px    (--r-lg, and correct there)
 *     THIS, until now          10px       14px    <- stayed a row step, now two
 *                                                    steps inside a 24px card
 *
 * So `rounded-lg` is no longer "one step inside the card" — it is the BUTTON and row
 * step, which is not what a card-body well is. `--r-xl` is: tokens.css names it
 * "account chips, tiles, a chart well", and account.jsx's dashed empty — the same idiom,
 * an approved primitive — already sits there. brief.jsx keeps `--r-lg` correctly,
 * because its dashed NOTE is a row inside a section, not a card body.
 *
 * WRITTEN AS `rounded-[var(--r-xl)]` AND NOT `rounded-xl`, WHICH WOULD BE A BUG.
 * The bridge pins `--radius-xl: 14px` as a literal for generated components, and
 * Tailwind bakes it in: the built CSS reads `.rounded-xl{border-radius:14px}`. So the
 * utility would silently keep today's wrong value. §6 records this trap; the token form is
 * the only one that tracks the ladder, and it is what account.jsx and rail.jsx already use.
 *
 * WHY IT LOOKED FINE IN SHADCN'S OWN SCREENSHOT: their empty sits in a container whose
 * radius is at least its own, so there is no inner-rounder-than-outer conflict to see. */
const EDGE = 'rounded-[var(--r-xl)] border border-dashed border-[var(--line-strong)]';

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
    <Empty className={cn(EDGE, ENTRANCE, className)}>
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
