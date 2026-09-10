/* error-state.jsx
 *
 * @design approved 2026-09-10 — 🔒 Cycle 00, piece 6. Signed off on the Test page beside
 *   the empty state, which is the only way to judge §15's claim that the two must not
 *   read alike. The piece was an AUDIT finding rather than a design one: the parts all
 *   existed and the app still had no error handling — two route-level pages out of
 *   seventy-four rendered anything when a fetch failed.
 *   A redesigned screen may adopt it. See test/primitives-status.test.js.
 */

import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import {
  Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { Button } from './button.jsx';

/* ErrorState — PropVexis primitive: a page that could not load.
 *
 * Cycle 00, piece 6, and the last part the kit owes. §15 names four states — populated,
 * loading, empty, bad — and three of them already had somewhere to live. This is the
 * fourth.
 *
 * ── THE FINDING: TWO PAGES OUT OF SEVENTY-FOUR HANDLE A FAILED LOAD ─────────────────
 *
 * This is not a component being restyled. `Analytics.jsx` and `Reports.jsx` are the only
 * route-level screens in the app that render anything when a fetch fails; the other
 * seventy-two render nothing, which in practice means a blank region or a skeleton that
 * never resolves. A trader on a broken connection cannot tell those apart from "you have
 * no trades", and one of those is a reason to close the tab.
 *
 * So the reason there is exactly ONE call site to migrate is not that errors are rare —
 * it is that the app has nowhere to put them. That is what a kit piece is for.
 *
 * ── AND THE ONE THAT EXISTS BREAKS §17 TWICE ────────────────────────────────────────
 *
 *     .banner.error { background: var(--tint-loss-7); color: var(--loss); … }
 *
 * §17 is locked and unambiguous: a system message may colour its GLYPH and its EDGE, it
 * may NOT colour its words, and it may not wash its surface (4% is the ceiling; this is
 * a 7% tint). Both halves are wrong, and the second is the one that matters in this
 * product — red is the trader's money. A screen washed in loss-red to say "the stats
 * endpoint timed out" is speaking the language of a losing day about a network problem.
 *
 * Here: the glyph carries full strength, the edge carries the tone at 20% (the value the
 * owner tuned the alert tones down to on 09-08, when four tones side by side read "too
 * colorful"), and **every word is neutral**.
 *
 * ── WHY IT IS A SIBLING OF `EmptyState` AND NOT A VARIANT OF IT ─────────────────────
 *
 * §15: "An empty state is not an error state." They share an ANATOMY — a centred block
 * with a glyph, a sentence and an action — so this is built on the same generated
 * `Empty` shell, which makes the two structurally identical by construction rather than
 * by anyone remembering to keep them so.
 *
 * What they must NOT share is the read, and three things separate them:
 *
 *   · THE EDGE IS SOLID, NOT DASHED. `EmptyState` draws
 *     `border-dashed border-[var(--line-strong)]` — a dashed outline is the visual idiom
 *     for "a space waiting to be filled", which is exactly right for "no trades yet" and
 *     exactly wrong for "this failed". A failure is not a placeholder.
 *   · THE GLYPH IS TONED. An empty state's icon is neutral; this one is `--warning` at
 *     full strength, which under §17 is the one place colour is spent.
 *   · IT OFFERS A WAY OUT. An empty state's action is a suggestion ("Add your first
 *     trade"); this one's is a retry, and the difference is that the user did nothing
 *     wrong and the app is asking for another go.
 *
 * A SEPARATE COMPONENT RATHER THAN `<EmptyState tone="error">` because a prop is a thing
 * you have to know to reach for. Fifteen call sites already import EmptyState; the next
 * person handling a failed fetch should find a part named for what they have, not a
 * flag on the part named for the opposite condition.
 *
 * ── WHAT THIS IS NOT: `Alert` ───────────────────────────────────────────────────────
 *
 * `alert.jsx` (approved, Batch 3, §17's four-tone ladder) stays the right answer for a
 * failure INSIDE a working screen — a form that would not submit, a panel that could not
 * refresh while the rest of the page is fine. The distinction is whether there is still
 * a page to read: an Alert is a message ON content, this REPLACES it. The data table
 * already draws the line in the same place — its `DataTableNotice` puts an Alert in a
 * full-span cell so the table keeps its header rather than being replaced by a box.
 */

/* SOLID, not dashed — see above. `--r-xl` matches `EmptyState`'s corner so the two
 * blocks are the same object at the same size; only the line style and the glyph differ. */
const EDGE = 'rounded-[var(--r-xl)] border border-[color-mix(in_oklab,var(--warning)_20%,transparent)]';

/* Same entrance as the empty state, and the same argument carries: this surface has NO
 * FIGURES TO READ, so the objection that motion in front of a number delays reading it
 * has nothing to bite on. It is also rare, and arriving deliberately beats appearing as
 * a bare box. */
const ENTRANCE = 'animate-[pv-content-in_var(--dur)_var(--ease)_backwards]';

function ErrorState({
  title = 'Could not load this',
  description,
  detail,
  onRetry,
  retryLabel = 'Try again',
  actions,
  className,
}) {
  return (
    <Empty className={cn(EDGE, ENTRANCE, className)} role="alert">
      <EmptyHeader>
        {/* THE ONLY COLOURED THING, and §17 spends it here on purpose: an error the user
            does not notice is a worse failure than one they briefly misread. */}
        <EmptyMedia variant="icon">
          <AlertTriangle className="text-[var(--warning-bright)]" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>

      {/* THE TECHNICAL STRING IS QUIETER THAN THE SENTENCE, AND THAT ORDER IS THE POINT.
          What ships today is `Could not load stats: {err}` — one line, in which a raw
          message from the server carries the same weight as the explanation. `err` is
          whatever the API said, is frequently unreadable, and is never the thing the
          reader needs first. It is kept because it is what makes a bug report useful,
          and demoted because it is not the message. */}
      {detail ? (
        <EmptyContent>
          <p className="font-mono text-xs text-[var(--text-3)] break-words">{detail}</p>
        </EmptyContent>
      ) : null}

      {(onRetry || actions) ? (
        <EmptyContent className="flex-row flex-wrap justify-center gap-3">
          {onRetry ? (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCw className="size-4" />
              {retryLabel}
            </Button>
          ) : null}
          {actions}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export { ErrorState };
