import React from 'react';
import { Badge as UIBadge } from '@/components/ui/badge';

/* CountBadge — PropVexis primitive.
 *
 * A NUMBER, not a status. This is the second badge in this directory and the split is
 * deliberate: `badge.jsx` is a status pill whose API is a `tone` drawn from trading
 * semantics (profit / loss / warn / ai), and it still renders `.u-badge` because the
 * library has no vocabulary for those. A count is the opposite kind of thing — it has
 * no domain meaning, only a magnitude and an urgency — so it maps cleanly onto the
 * generated Badge and gets to be library-backed today.
 *
 * WHY IT IS A PRIMITIVE AT ALL, rather than a utility string at the two call sites:
 * `topbar-overlays.test.js` pins the rule that a page may not originate appearance,
 * after an earlier increment passed `bg-transparent shadow-none ring-0` down from
 * FilterBar and put visual values in the pages layer. Two callers each spelling out a
 * pill in utilities is that same mistake in a smaller font — and it also defeats the
 * class harvest `utility-collisions.test.js` runs, which can only reason about
 * appearance it finds in this directory.
 *
 * It replaces `.tb-badge` and `.notif-badge`, two legacy rules that had drifted to
 * different sizes (16px vs 18px), different radii and different corner treatments for
 * what is the same component seen twice.
 */

// DESIGN-LANGUAGE §5 assignment by surface puts badges and pills on `--r-full`; the
// generated Badge defaults to `rounded-2xl`, which is the card step. The locked rule
// wins, same as the Button's radius correction.
//
// `h-4`/`min-w-4` narrows the generated `h-5` to the footprint a two-character count
// actually needs in a 28px control, and `tabular-nums` stops 1→2 unread from changing
// the pill's width. §3 weight discipline is why it stays at 400 rather than taking the
// generated Badge's `font-medium`: a number this size is already the loudest thing in
// its 16px box.
const BASE = 'h-4 min-w-4 px-1 rounded-full text-xs font-normal tabular-nums';

const TONES = {
  // A count of applied filters is SELECTION state, and §4 "neutral selection" locks
  // that grayscale — never a brand tint. (Legacy `.tb-badge` set `--accent` and was
  // then overridden to neutral 300 lines further down; this is that override, kept.)
  neutral: 'bg-muted text-foreground',
  /* UNREAD ALERTS ARE NO LONGER RED (2026-08-29, Rhea).
   *
   * This tone was `bg-destructive`, argued as "an unread count reports a CONDITION, so
   * §4's neutral-selection lock does not reach it". The argument was about the wrong
   * half of §4. The rule it runs into is the other one — "green and red are trade
   * outcomes ONLY. Never status, never chrome" — and a red dot in the top bar of a
   * trading app is precisely the collision that rule exists to prevent: the one place a
   * trader's eye is trained to read red as MONEY LOST, spent on "you have mail".
   *
   * Rhea draws it as a light dot, and light is what this design uses for "attend to
   * this" (§4: primary actions are light, not brand). The ring below separates it from
   * the glyph underneath either way. */
  alert: 'bg-[var(--action-2)] text-[var(--on-action)]',
};

/* `corner` is the bell's case: the pill hangs off the top-right of the control it
 * counts. The ring is how it separates from the icon underneath — a ring rather than
 * the `2px solid var(--bg)` border the legacy rule used, because a border would have
 * grown the pill by 4px and `ring-background` paints the same gap without touching
 * layout. Positioning lives here too, so a caller never needs `absolute` for this. */
function CountBadge({ tone = 'neutral', corner = false, className, ...rest }) {
  return (
    <UIBadge
      variant="secondary"
      className={[
        BASE,
        TONES[tone] ?? TONES.neutral,
        corner && 'absolute -top-1 -right-1 ring-2 ring-background',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export { CountBadge };
