/* KitTabs — the Cycle 00 review specimens for tabs. DEV ONLY.
 *
 * Rendered by PrimitiveReview (`/test`), piece 7.
 *
 * ── WHY THERE IS A PIECE 7 AT ALL, WHICH IS THE FINDING ─────────────────────────────
 *
 * The owner asked why tabs were not in any piece. They were in the brief — §4.5 — and
 * its first line is "The conversion is already done… Nothing to design here." That
 * sentence was true and it is why this never became a numbered piece: the item read as
 * finished, so it was never scheduled, and the DECISION it still owed went with it.
 *
 * THAT IS THE THIRD TIME IN THIS CYCLE an audit note filed something under "nothing to
 * do" and hid real work — `ui/tooltip.jsx` (installed, never wrapped), `ui/sheet.jsx`
 * (same), and now this. The pattern is specific enough to name: **"already done" is a
 * claim about the CONVERSION, never about the DECISION**, and the two get written on the
 * same line.
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING.
 */
import React, { useState } from 'react';
import { BarChart3, CalendarDays, Table as TableIcon } from 'lucide-react';
import {
  PanelTab, PanelTabs, Tabs, TabsList, TabsRoot, TabsTrigger,
} from '@/components/primitives';

/* THE SCAFFOLD'S OWN LOOK, copied from KitStates so the seven pieces read as one page. */
const F = {
  card: {
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)',
    margin: '22px auto 0', maxWidth: 1080, overflow: 'hidden',
  },
  head: {
    display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
    padding: '14px 18px', borderBottom: '1px solid var(--line-inset)',
  },
  name: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  mono: { fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' },
  strong: { color: 'var(--text)', fontWeight: 600 },
  note: {
    padding: '11px 18px', borderTop: '1px solid var(--line-inset)',
    background: 'var(--surface-sunken)', fontSize: 12.5, lineHeight: '20px', color: 'var(--text-2)',
  },
  pane: { padding: '22px 18px', minWidth: 0 },
  label: {
    fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500,
  },
  hint: { fontSize: 12, color: 'var(--text-3)', lineHeight: '18px' },
  /* A card-shaped frame, so the panel strip is judged where it actually lives: as the
   * TOP EDGE of a card, not floating on the page. That is its whole argument. */
  cardFrame: {
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-card)', overflow: 'hidden',
  },
};

/* ═══════════════════════════════════════════ 1 · THE TWO SKINS, AND THEY ARE ONE PART ═ */
export function TabsSpecimen() {
  const [page, setPage] = useState('overview');
  const [panel, setPanel] = useState('recent');

  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>One tab style, two skins</span>
        <span style={F.mono}>primitives/tabs.jsx · panel.jsx</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          both are the same shipped trigger now
        </span>
      </div>

      <div style={{ ...F.pane, display: 'grid', gap: 26 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <span style={F.label}>The page switcher — `Tabs`, the array form · 9 screens</span>
          <Tabs
            value={page}
            onChange={setPage}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'accounts', label: 'Accounts' },
              { value: 'payouts', label: 'Payouts' },
            ]}
          />
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <span style={F.label}>
            The panel edge — `PanelTabs`, now a COMPOSITION of the same trigger
          </span>
          <div style={F.cardFrame}>
            <PanelTabs value={panel} onValueChange={setPanel}>
              <PanelTab value="recent">Recent trades</PanelTab>
              <PanelTab value="open">Open positions</PanelTab>
            </PanelTabs>
            <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text-3)' }}>
              {panel === 'recent' ? 'Six most recent trades…' : 'Two open positions…'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <span style={F.label}>
            And what the parts now allow — a trigger with anything in it
          </span>
          <TabsExample />
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>These were two hand-written components until today. </strong>
        The panel strip differed in four ways — 16px semibold rather than 14px medium,
        {' '}
        <code style={F.mono}>--action-2</code>
        {' '}
        rather than the foreground for the active line, measured padding, and a
        {' '}
        <code style={F.mono}>border-b-2</code>
        {' '}
        instead of the registry&rsquo;s
        {' '}
        <code style={F.mono}>after:</code>
        {' '}
        — and
        {' '}
        <strong style={F.strong}>every one of those is a class on a shipped trigger.</strong>
        {' '}
        What stopped it being one was the API:
        {' '}
        <code style={F.mono}>Tabs</code>
        {' '}
        exposed only
        {' '}
        <code style={F.mono}>tabs=&#123;[&#123;value, label&#125;]&#125;</code>
        , so a caller could not reach a trigger and had no choice but to hand-build.
        Exporting
        {' '}
        <code style={F.mono}>TabsList</code>
        {' '}
        and
        {' '}
        <code style={F.mono}>TabsTrigger</code>
        {' '}
        is the whole mechanical change.
        <br />
        <br />
        <strong style={F.strong}>⚠ Please look at the panel strip against the Dashboard. </strong>
        The intent is that nothing moved, and there is one arithmetic reason it might
        have:
        {' '}
        <code style={F.mono}>border-b-2</code>
        {' '}
        occupied 2px of height and the registry&rsquo;s absolutely-positioned
        {' '}
        <code style={F.mono}>after:</code>
        {' '}
        occupies none, so the bottom padding went from 13px to 15px to keep the strip at
        48px. The metrics are asserted by a test; whether the RESULT is identical is the
        thing only your eye can settle.
      </div>
    </div>
  );
}

/* A composed strip with something in a trigger the array form cannot express — a count.
 * This is the capability the piece bought, shown rather than described.
 *
 * ⚠ AND IT DRAWS THE LIMIT OF WHAT "IT IS A COMPOSITION NOW" MEANS, which is worth
 * having in writing because the sentence promises more than it delivers.
 *
 * Everything here is an INLINE STYLE, because this file is a PAGE: Tailwind's `@source`
 * covers `components/{ui,primitives}` only, so a `className` written here compiles to
 * nothing at all. So a page can compose the STRUCTURE of a tab strip — put a count, a
 * dot, an icon inside a trigger — and it CANNOT restyle one. Changing a trigger's
 * weight, padding or underline is still a job for a primitive, which is exactly what
 * `PanelTab` is and why it stays a named part rather than becoming a pile of classes at
 * its call site.
 *
 * The `border-b` and the list's own layout come from `variant="line"` and the
 * component's defaults; only the content and its spacing are set here. */
function TabsExample() {
  const [v, setV] = useState('all');
  const items = [['all', 'All', 412], ['wins', 'Wins', 268], ['losses', 'Losses', 144]];
  return (
    <TabsRoot value={v} onValueChange={setV}>
      <TabsList
        variant="line"
        style={{
          width: '100%', justifyContent: 'flex-start', gap: 20, height: 'auto',
          borderBottom: '1px solid var(--line)', borderRadius: 0, padding: 0,
        }}
      >
        {items.map(([value, label, n]) => (
          <TabsTrigger
            key={value}
            value={value}
            style={{
              flex: 'none', borderRadius: 0, padding: '6px 0', gap: 6,
            }}
          >
            {label}
            <span style={{
              fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums',
            }}
            >
              {n}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </TabsRoot>
  );
}

/* ════════════════════════════════════ 1b · THE STYLES, BECAUSE LINE IS NOT THE ONLY ONE ═
 *
 * OWNER, 2026-09-10: "we will not only be using the current line style tabs everywhere,
 * we will also use different styles". So this is the range, in one place, at real sizes.
 *
 * TWO OF THESE ARE THE REGISTRY'S OWN VARIANTS and the rest are compositions of them --
 * which is this piece's whole claim, made checkable. `tabsListVariants` ships exactly two:
 *
 *   . `line`    -- a rule under the active label. What the app uses today, 9 screens.
 *   . `default` -- a SEGMENTED control: the list is a filled `bg-muted` trough with a
 *                  3px inset, and the active tab is a raised `bg-background` pill inside
 *                  it. A genuinely different object rather than a restyle -- it reads as
 *                  "these are the only options", where a line reads as "you are looking
 *                  at this one of several sections".
 *
 * WHEN TO USE WHICH is the thing worth deciding once, and the shapes suggest it: a LINE
 * belongs at the top of a region you are navigating (a page, a panel's own edge); a
 * SEGMENT belongs beside content it filters, where the set is small, closed and equal.
 * Nothing here enforces that -- it is what the two look like side by side.
 */
export function TabsStyles() {
  const [line, setLine] = useState('overview');
  const [seg, setSeg] = useState('r');
  const [icons, setIcons] = useState('table');
  const [counts, setCounts] = useState('all');

  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>The styles available, and what each one says</span>
        <span style={F.mono}>2 registry variants · the rest are compositions</span>
        <span style={{ flex: 1 }} />
      </div>

      <div style={{ ...F.pane, display: 'grid', gap: 26 }}>
        <div style={{ display: 'grid', gap: 9 }}>
          <span style={F.label}>Line — the registry variant · today&rsquo;s 9 screens</span>
          <Tabs
            value={line}
            onChange={setLine}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'accounts', label: 'Accounts' },
              { value: 'payouts', label: 'Payouts' },
            ]}
          />
          <span style={F.hint}>
            Navigating a region. Sits on a rule; the page continues below it.
          </span>
        </div>

        <div style={{ display: 'grid', gap: 9, justifyItems: 'start' }}>
          <span style={F.label}>Segmented — the registry&rsquo;s other variant, unused so far</span>
          <TabsRoot value={seg} onValueChange={setSeg}>
            <TabsList>
              <TabsTrigger value="r">R</TabsTrigger>
              <TabsTrigger value="usd">$</TabsTrigger>
              <TabsTrigger value="pct">%</TabsTrigger>
            </TabsList>
          </TabsRoot>
          <span style={F.hint}>
            A small, closed, equal set — a unit switch, a range. Reads as &ldquo;these are
            the only options&rdquo;.
          </span>
        </div>

        <div style={{ display: 'grid', gap: 9, justifyItems: 'start' }}>
          <span style={F.label}>Segmented with icons — the same variant, richer triggers</span>
          <TabsRoot value={icons} onValueChange={setIcons}>
            <TabsList>
              <TabsTrigger value="table" style={{ gap: 6 }}>
                <TableIcon size={14} />
                Table
              </TabsTrigger>
              <TabsTrigger value="chart" style={{ gap: 6 }}>
                <BarChart3 size={14} />
                Chart
              </TabsTrigger>
              <TabsTrigger value="cal" style={{ gap: 6 }}>
                <CalendarDays size={14} />
                Calendar
              </TabsTrigger>
            </TabsList>
          </TabsRoot>
          <span style={F.hint}>
            Same data, different rendering — where a glyph carries the meaning.
          </span>
        </div>

        <div style={{ display: 'grid', gap: 9 }}>
          <span style={F.label}>Line with counts — what the array form cannot express</span>
          <TabsWithCounts value={counts} onChange={setCounts} />
          <span style={F.hint}>
            The capability piece 7 bought: a trigger can hold anything, so a filter tab can
            say how many.
          </span>
        </div>

        <div style={{ display: 'grid', gap: 9 }}>
          <span style={F.label}>Panel edge — our second skin, on a card</span>
          <div style={F.cardFrame}>
            <PanelTabs value="recent" onValueChange={() => {}}>
              <PanelTab value="recent">Recent trades</PanelTab>
              <PanelTab value="open">Open positions</PanelTab>
            </PanelTabs>
            <div style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text-3)' }}>
              16px semibold, the brand line, and it IS the card&rsquo;s top edge.
            </div>
          </div>
          <span style={F.hint}>
            Heavier than the page switcher on purpose — it is a card&rsquo;s own heading.
          </span>
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>
          The segmented variant has never been used in this app, and it ships.
        </strong>
        {' '}
        That is worth knowing before the next screen invents a unit switch: an R/$/%
        toggle, a 7d/30d/all range, a table-or-chart view — those are all
        {' '}
        <code style={F.mono}>variant=&quot;default&quot;</code>
        , and today each would get hand-built as a row of buttons because nobody knew the
        variant was there.
        <br />
        <br />
        <strong style={F.strong}>⚠ It overlaps `ToggleGroup`, which is also approved, and
        the line between them is worth your ruling. </strong>
        The one that holds up:
        {' '}
        <strong style={F.strong}>tabs SWITCH A VIEW, a toggle group SETS A VALUE.</strong>
        {' '}
        Tabs change what you are looking at and the rest of the page follows; a toggle
        group changes a setting and the page stays where it is. Both are on this page now
        so the difference can be seen rather than argued.
      </div>
    </div>
  );
}

/* Counts, in the composed form — see the note in TabsExample on what a PAGE can and
 * cannot do to a trigger. */
function TabsWithCounts({ value, onChange }) {
  const items = [['all', 'All', 412], ['wins', 'Wins', 268], ['losses', 'Losses', 144]];
  return (
    <TabsRoot value={value} onValueChange={onChange}>
      <TabsList
        variant="line"
        style={{
          width: '100%',
          justifyContent: 'flex-start',
          gap: 20,
          height: 'auto',
          borderBottom: '1px solid var(--line)',
          borderRadius: 0,
          padding: 0,
        }}
      >
        {items.map(([v, label, n]) => (
          <TabsTrigger
            key={v}
            value={v}
            style={{ flex: 'none', borderRadius: 0, padding: '6px 0', gap: 6 }}
          >
            {label}
            <span
              style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}
            >
              {n}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </TabsRoot>
  );
}

/* ═══════════════════════════════════════════════════ 2 · WHAT IS LEFT, AND WHAT IT COSTS ═ */
export function TabsRemaining() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>The third one, deliberately not touched</span>
        <span style={F.mono}>.dash-acct-tab · 5 legacy rules</span>
        <span style={{ flex: 1 }} />
      </div>

      <div style={F.note}>
        <strong style={F.strong}>The Dashboard&rsquo;s account selector is still on legacy
        CSS, and that was your call. </strong>
        Five rules —
        {' '}
        <code style={F.mono}>.dash-acct-tab</code>
        {' '}
        plus its status dot in three tones — carrying rich content: an account name, a
        coloured dot and figures. The registry&rsquo;s trigger can host all of that (the
        count example above is the same shape), so it is not blocked on anything
        technical. It is a bigger change to a locked page than the panel strip was, and
        one visual risk at a time on the Dashboard is enough.
        <br />
        <br />
        <strong style={F.strong}>After this piece the app has ONE tab implementation and
        one exception, </strong>
        where it had three and no way to avoid a fourth. That last part is the actual
        cure: a caller who needs a different tab can now compose one instead of copying
        the underline rules, which is how the second and third came to exist.
        <br />
        <br />
        <strong style={F.strong}>Free with the rebuild, and not cosmetic: </strong>
        arrow-key navigation and a roving tabindex. The hand-written strip declared
        {' '}
        <code style={F.mono}>role=&quot;tab&quot;</code>
        {' '}
        and
        {' '}
        <code style={F.mono}>role=&quot;tablist&quot;</code>
        {' '}
        and implemented neither — it told a screen reader it was tabs and then did not
        behave like them, which is worse than not claiming the role.
      </div>
    </div>
  );
}
