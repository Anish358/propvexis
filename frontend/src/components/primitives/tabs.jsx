/* tabs.jsx
 *
 * @design approved 2026-09-08 — owner signed off Batch 6 (Rebuilt, then reviewed) as a
 *   family on the Test page. These three were rebuilt off legacy CSS the same day and
 *   reviewed as the rebuild, not as what preceded it. See test/primitives-status.test.js.
 */

import React from 'react';
import {
  Tabs as UITabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/* Tabs — PropVexis primitive.
 *
 * THE ONE TAB / SWITCHER PATTERN FOR THE APP. Use this for any multi-view, filter or
 * category switcher instead of inventing a new tab style. Underline-based: a thin line
 * under the active label, muted and underline-less when inactive, a faint underline
 * preview on hover. No filled pill, no bordered box.
 *
 * `tabs` = [{ value, label }] — unchanged, so no caller moved.
 *
 * If a switcher needs richer per-tab content than a single label — icons, multi-line
 * text, dividers, fixed widths, as the Dashboard's account selector does — it cannot use
 * this API, but it MUST still follow the same underline interaction pattern.
 *
 * ── REBUILT OFF LEGACY CSS ON 2026-09-08, AND THE REASON IT WAITED WAS WRONG ──────────
 *
 * This file said Tabs was "the LAST primitive scheduled for library adoption" because "it
 * is the most opinionated component in the app, its interaction pattern is a documented
 * design-system rule rather than a default, and a generated tab list arrives with its own
 * idea of all of that."
 *
 * THE REGISTRY SHIPS OUR PATTERN AS A VARIANT. `@shadcn/tabs` at base-rhea has
 * `variant="line"`: the list goes transparent and loses its radius, and the trigger draws
 * `after:h-0.5 after:bg-foreground after:opacity-0`, fading to `opacity-100` when active.
 * That is the underline rule, from the registry, with nothing hand-built — so the whole
 * argument for holding this component back had expired. Fifth expired justification found
 * in this layer during the review, after two in `select.jsx`, one in `wizard.jsx` and one
 * in `empty-state.jsx`.
 *
 * TWO THINGS THE WRAPPER STILL SUPPLIES, and both are rules rather than taste:
 *
 * 1. THE RAIL. Legacy drew `border-bottom: 1px solid var(--line)` under the whole list —
 *    the line the tabs sit on, which is what makes an underline read as a SELECTED tab
 *    rather than as an underlined word. The generated `line` variant has no rail.
 * 2. THE HOVER PREVIEW. Legacy showed a 1px underline on a non-active tab under the
 *    cursor, against 2.5px when active. It is what tells you the labels are clickable
 *    before you click one. The generated trigger fades its underline in on ACTIVE only.
 *
 * The active underline is left at the generated `h-0.5` (2px) rather than restored to
 * legacy's 2.5px — 2.5px is not a value on any scale in this app, and the half-pixel was
 * a legacy literal rather than a decision.
 *
 * `gap-5` restates legacy's 20px between labels, which the generated `line` variant sets
 * to `gap-1`. A 4px gap between text labels reads as one run-on word.
 */

/* The rail, and the hover preview. `after:` on the trigger is the generated underline, so
 * the hover rule reaches the same element the active rule does — one underline, two
 * strengths, rather than a second element that has to line up with the first. */
/* THE RAIL IS A PROP, NOT A CLASS A CALLER CAN CANCEL, and that is a cascade fact
 * rather than a preference. Legacy let one caller opt out with
 * `.fin-breakdown-tabs { border-bottom: none }` — a legacy rule, which now sits in the
 * LOWEST layer and would lose to any Tailwind utility this component sets. So an opt-out
 * expressed in CSS can no longer work, and it has to be expressed in the API. One caller
 * uses it (Finance's breakdown switcher, which sits inside a card that already has an
 * edge), and it now says so in JSX. */
const LIST = 'w-full justify-start gap-5';
const RAIL = 'border-b border-border';
const TRIGGER = [
  'px-0 py-1.5 rounded-none',
  'text-muted-foreground data-active:text-foreground hover:text-foreground',
  'group-data-[variant=line]/tabs-list:hover:not-data-active:after:opacity-40',
].join(' ');

/* `className` GOES ON THE LIST, not on the root, because that is where legacy put it and
 * seven call sites still pass a legacy class to it — `.fin-tabs` sets `display: flex;
 * width: 100%`, `.pc-firms` sets `overflow-x: auto`, `.pa-slices` sets `align-self`.
 * Every one of those describes the ROW of tabs. Landing them on a new outer wrapper would
 * have applied a row's layout to a column and broken all seven silently, which is the
 * opposite of what this seam promises. */
function Tabs({ tabs = [], value, onChange, rail = true, className }) {
  return (
    <UITabs
      value={value}
      onValueChange={(next) => onChange?.(next)}
      className="gap-0"
    >
      <TabsList variant="line" className={cn(LIST, rail && RAIL, className)}>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className={TRIGGER}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </UITabs>
  );
}

/* ── THE PARTS ARE EXPORTED TOO, AND THAT IS CYCLE 00 PIECE 7's WHOLE MECHANICAL CHANGE ─
 *
 * `Tabs` above takes `tabs={[{ value, label }]}`. That array is convenient for the nine
 * screens using it and it is also the REASON THIS APP HAS THREE TAB IMPLEMENTATIONS: a
 * caller cannot reach an individual trigger, so anything wanting a different weight,
 * padding or underline colour is PHYSICALLY UNABLE to use this component and has to
 * hand-build one. Both of the others did exactly that.
 *
 *   · `PanelTabs`/`PanelTab` (panel.jsx, approved) — a panel's top EDGE. Differs in four
 *     ways: 16px semibold against 14px medium, `--action-2` against the foreground,
 *     measured padding, and `border-b-2` instead of the registry's `after:`. Every one
 *     of those is a CLASS ON A SHIPPED TRIGGER rather than a reason to write a second
 *     component — but with only the array exported there was no shipped trigger to put
 *     a class on.
 *   · the Dashboard account selector — legacy `.dash-acct-tab*`, five rules, rich content
 *     (a name, a status dot, figures).
 *
 * SO THE ARRAY STAYS AND THE PARTS COME WITH IT. Nine call sites keep the short form;
 * anything richer is now a COMPOSITION of the same component instead of a copy of its
 * rules. This does not by itself change either of the other two — that is a decision
 * about the locked dashboard, and it is the owner's — but it removes the reason a FOURTH
 * one would ever be written, which is the actual disease.
 *
 * `TabsContent` comes along because a composed tab strip that owns its panels needs it
 * and there is no argument for making that the one part you cannot reach.
 *
 * ⚠ AND `TabsRoot`, WHICH WAS NEARLY MISSED AND WOULD HAVE MADE THE WHOLE PIECE A NO-OP.
 * The first version of this export exposed the list and the trigger and NOT the root —
 * and a list and a trigger without a root compose into nothing, because Base UI's parts
 * read their state from it. `PanelTabs` did not catch this: it lives in
 * `components/primitives`, so it can import the generated root directly. A PAGE cannot.
 * The specimen on /test is what found it, one line after the export was written, which
 * is the argument for building a specimen that actually composes rather than one that
 * describes composing. */
export {
  Tabs, TabsContent, TabsList, TabsTrigger, UITabs as TabsRoot,
};
