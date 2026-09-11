/* KitFilterBar — the Cycle 00 review specimens for the filter builder. DEV ONLY.
 *
 * Rendered by PrimitiveReview (`/test`), piece 3. Same method as the table and the tooltip
 * before it: the REAL components in the real cascade.
 *
 * THE DATA BELOW IS THE REAL REGISTRY. `FILTERS` and `FILTER_GROUPS` are imported from
 * `features/filters/filterDefs.js`, not retyped — so the specimen shows the actual filter
 * names, the actual grouping, and the actual count. A kit piece reviewed against invented
 * options is a kit piece reviewed against a shorter list than the one it has to hold.
 *
 * WHAT IS NOT HERE: the panel's behaviour. `FilterPanel.jsx` has 529 lines of deliberate
 * keyboard work — an Escape that unwinds one cascade level at a time, a roving
 * `aria-activedescendant` cursor, a search that re-groups as you type. None of it is
 * touched or reimplemented; this pane is the LOOK of the parts it would be rebuilt on.
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING.
 */
import React, { useState } from 'react';
import { CalendarDays, CircleDot, Landmark, Layers, TrendingUp } from 'lucide-react';
import {
  Command, CommandCount, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  Button, ButtonLabel, CommandList, CommandSeparator, FilterChip, FilterChipAdd,
  FilterChips, FilterChipsTail, FilterCount,
} from '@/components/primitives';
/* THE ACTUAL INSTALLED SOURCE, via Vite's `?raw`. Not a transcription — the string below
 * IS the file on disk, resolved at build time, so this pane cannot drift from what shadcn
 * wrote. That matters more than usual here: the whole "is this ours or the registry's?"
 * question was settled by reading these files, and a copy-pasted excerpt would have to be
 * re-verified every time the registry changes. */
import commandSource from '@/components/ui/command.jsx?raw';
import inputGroupSource from '@/components/ui/input-group.jsx?raw';
import { FILTERS, FILTER_GROUPS } from '../filters/filterDefs.js';

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
  pane: { padding: '18px', minWidth: 0 },
  row: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  label: {
    fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500, marginBottom: 10, display: 'block',
  },
  code: {
    margin: 0, padding: '14px 18px', maxHeight: 420, overflow: 'auto',
    fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: '18px',
    color: 'var(--text-2)', background: 'var(--bg)',
    borderTop: '1px solid var(--line-inset)', whiteSpace: 'pre',
  },
  tab: (on) => ({
    padding: '5px 10px', fontSize: 12, cursor: 'pointer',
    background: on ? 'var(--sel-bg-strong)' : 'transparent',
    color: on ? 'var(--text)' : 'var(--text-2)',
    border: '1px solid ' + (on ? 'var(--line-strong)' : 'var(--line)'),
    borderRadius: 'var(--r-md)', fontFamily: 'inherit',
  }),
  /* THE COLUMN'S REAL WIDTH. `--fp-w` is what the shipped cascade uses; read from the
   * variable rather than typed, so the specimen cannot drift from the panel. */
  col: { width: 'var(--fp-w, 232px)', flex: 'none' },
};

/* ONE ICON PER GROUP, NOT PER FILTER. Linear gives every field its own glyph; we have
 * thirty filters and no iconography for them, and inventing thirty is a design task rather
 * than a kit one. The five GROUPS already exist in `filterDefs.js`, so five icons carry the
 * same "you can tell what kind of thing this is at a glance" without anyone inventing a
 * symbol for "MTF phase". If the owner wants per-filter icons later, the chip takes any
 * node — nothing here has to change. */
const GROUP_ICON = {
  trade: <CircleDot />,
  setup: <Layers />,
  performance: <TrendingUp />,
  time: <CalendarDays />,
  account: <Landmark />,
};

/* THE APPLIED FILTERS, as a trader would actually have them — a multi with several values
 * (so the truncation is on screen), a single, and a range. Not three of the same shape.
 * `field` and the operator are read out of the real registry rather than typed, so a
 * renamed filter cannot leave this pane describing one that no longer exists. */
const APPLIED = ['sessions', 'outcome', 'setups', 'vol'].map((id) => {
  const def = FILTERS.find((f) => f.id === id);
  return { id, def, value: null };
});

/* THE COUNTS. 412 closed trades is the figure this page has used since the table specimen
 * (a trader with three accounts and ~400 trades); 38 is what these four filters leave. The
 * NUMBERS are illustrative, but the RELATIONSHIP on screen is real: clear the filters and
 * the readout drops the "of" and shows the whole set, which is what the component does. */
const TOTAL = 412;
const SHOWN = 38;

/* The values are authored, and this is the one thing on the page that is not derived —
 * see the questions pane. Linear collapses a multi to "3 labels"; ours collapses to
 * "First +N" (`chipValue` in filterDefs). Both are on screen here on purpose. */
const VALUES = {
  sessions: 'London, New York',
  outcome: 'Winners',
  setups: 'Break & Retest +3',
  vol: '0.10 – 2.00',
};

export function FilterChipSpecimen() {
  const [chips, setChips] = useState(APPLIED);
  const [editing, setEditing] = useState('outcome');
  const remove = (id) => setChips((c) => c.filter((x) => x.id !== id));
  const reset = () => { setChips(APPLIED); setEditing('outcome'); };

  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>The applied filters — one object, two controls</span>
        <span style={F.mono}>primitives/filter-chip.jsx · hand-written (§1 step 4)</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {chips.length} applied
        </span>
      </div>

      <div style={F.pane}>
        <span style={F.label}>The chip row, as the panel opens with it</span>
        <FilterChips>
          {chips.map(({ id, def }) => (
            <FilterChip
              key={id}
              icon={GROUP_ICON[def.group]}
              field={def.label}
              value={VALUES[id]}
              editing={editing === id}
              onEdit={() => setEditing(editing === id ? null : id)}
              onRemove={() => remove(id)}
            />
          ))}
          <FilterChipAdd onClick={reset} />

          {/* THE TAIL. Clear really clears here, and the count really follows — with no
              chips it reads "412 trades" rather than "412 of 412", which is the rule in
              `FilterCount` rather than a state this specimen fakes. */}
          <FilterChipsTail>
            <FilterCount shown={chips.length ? SHOWN : TOTAL} total={TOTAL} />
            {chips.length > 0 && (
              <Button variant="chrome" size="sm" onClick={() => { setChips([]); setEditing(null); }}>
                <ButtonLabel>Clear</ButtonLabel>
              </Button>
            )}
          </FilterChipsTail>
        </FilterChips>
        {chips.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            All removed — the + puts them back.
          </span>
        )}
      </div>

      <div style={F.note}>
        <strong style={F.strong}>Two segments — field, value — after a round trip through
        three. </strong>
        It started as
        {' '}
        <code style={F.mono}>Session: London, New York ×</code>
        {', went to Linear’s full sentence with an operator in the middle ("is any '}
        of&rdquo;), and came back to two on your call.
        {' '}
        <strong style={F.strong}>Everything else from that round stayed, </strong>
        because none of it was the operator&rsquo;s doing: the hairline between the halves,
        the leading icon, the fixed height, the
        {' '}
        <code style={F.mono}>--line-chip</code>
        {' edge, and the fact that only the VALUE is a control. '}
        <strong style={F.strong}>The one thing that moved with it </strong>
        is the contrast: with three segments the operator carried the quiet middle, so with
        two the FIELD has to be the quiet half or the chip reads as two equal words. That is
        the same label/value split the dashboard uses everywhere.
        {' '}
        <strong style={F.strong}>The prop went too. </strong>
        <code style={F.mono}>operator</code>
        {' rendered conditionally, so leaving it would have cost nothing and "worked" — '}
        which is exactly why it is deleted. A switch that outlives its question is how one
        component ends up able to look like two.
        <br />
        <br />
        <strong style={F.strong}>Two things in the reference are deliberately NOT here,
        and both are §2 — never build a control the product cannot honour. </strong>
        <strong style={F.strong}>The field is not clickable: </strong>
        Linear swaps &ldquo;Assignee&rdquo; for &ldquo;Creator&rdquo; in place; we have no
        such flow, so only the VALUE is a button — which is exactly what the panel already
        does when a chip is clicked.
        {' '}
        <strong style={F.strong}>And there is no Save. </strong>
        Saved views do not exist here — no endpoint, no route — so that one has not moved.
        <br />
        <br />
        <strong style={F.strong}>The tail is new, and both its numbers are real. </strong>
        <code style={F.mono}>App.jsx</code>
        {' already computes filterTrades(normalizedTrades, …), so the filtered length and '}
        the unfiltered length sit on adjacent lines — the Trade Log even prints the first
        one today. So the readout adds no number nobody has.
        {' '}
        <strong style={F.strong}>&ldquo;of&rdquo; only appears when the filters actually
        narrowed something. </strong>
        Press Clear: it reads &ldquo;412 trades&rdquo;, not &ldquo;412 of 412&rdquo; —
        which is a sentence that makes you look for a filter you have not set. That is a
        rule in the component, not a state this pane fakes.
        {' '}
        <strong style={F.strong}>Clear is the approved Button, </strong>
        not a new part —
        {' '}
        <code style={F.mono}>variant=&quot;chrome&quot;</code>
        {', the quiet identity every other quiet control in the app already wears (§1 '}
        step 1: stop at a settled primitive). It appears only when there is something to
        clear.
        {' '}
        <strong style={F.strong}>One thing for you at migration: </strong>
        the panel&rsquo;s head has a Clear of its own. That one should GO rather than become
        a second one — where these parts live on the real screen is still the panel&rsquo;s
        decision.
        <br />
        <br />
        <strong style={F.strong}>Two things to judge. </strong>
        <strong style={F.strong}>1. The icons are per GROUP, not per filter. </strong>
        Linear gives every field its own glyph; we have thirty filters and no iconography,
        and inventing thirty is a design job rather than a kit one. The five groups already
        exist, so five icons carry the same glance-value without anyone having to invent a
        symbol for &ldquo;MTF phase&rdquo;. Say the word and it goes per-filter — the chip
        takes any node.
        {' '}
        <strong style={F.strong}>2. How a multi-value collapses is still open. </strong>
        Linear says &ldquo;3 labels&rdquo;. Ours says &ldquo;Break &amp; Retest +3&rdquo;,
        which is what
        {' '}
        <code style={F.mono}>chipValue</code>
        {' already computes. Theirs is tidier; ours tells you which one. Both are on screen '}
        — Session shows two names, Strategy shows the overflow form.
      </div>
    </div>
  );
}

/* THE CASCADE COLUMN. Two of them, because the whole point of the panel is that choosing a
 * filter opens a second column BESIDE the first rather than replacing it. */
export function FilterCascadeSpecimen() {
  const [picked, setPicked] = useState('sessions');
  const [values, setValues] = useState(() => new Set(['london', 'ny']));

  const toggle = (v) => setValues((s) => {
    const next = new Set(s);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  });

  const def = FILTERS.find((f) => f.id === picked);
  const options = def?.values || [];

  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>The cascade — which filter, then which values</span>
        <span style={F.mono}>primitives/command.jsx · @shadcn/command</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {FILTERS.length} filters registered
        </span>
      </div>

      <div style={{ ...F.pane, ...F.row }}>
        <div style={F.col}>
          <span style={F.label}>Column 1 — which filter</span>
          <Command>
            <CommandInput placeholder="Search filters…" />
            <CommandList>
              <CommandEmpty>No matches</CommandEmpty>
              {/* A DIVIDER BETWEEN GROUPS IS PLACED BY THE CALLER, NOT BY CommandGroup
                  (owner, 2026-09-09 — "there are no dividers in ours"). Nothing removed
                  it: `@shadcn/command`'s own demo writes `<CommandSeparator />` between
                  its two groups by hand, and this pane simply never did. Five groups, so
                  four separators — before every group but the first. */}
              {FILTER_GROUPS.map((g, i) => {
                const inGroup = FILTERS.filter((f) => f.group === g.id);
                if (!inGroup.length) return null;
                return (
                  <React.Fragment key={g.id}>
                    {i > 0 && <CommandSeparator />}
                    <CommandGroup heading={g.label}>
                      {inGroup.map((f) => (
                        <CommandItem
                          key={f.id}
                          value={f.label}
                          onSelect={() => setPicked(f.id)}
                          data-checked={f.id === picked || undefined}
                        >
                          {f.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </React.Fragment>
                );
              })}
            </CommandList>
          </Command>
        </div>

        <div style={F.col}>
          <span style={F.label}>Column 2 — which values</span>
          <Command>
            <CommandInput placeholder={`Search ${def?.label?.toLowerCase() || 'values'}…`} />
            <CommandList>
              <CommandEmpty>No matches</CommandEmpty>
              <CommandGroup heading={def?.label || 'Values'}>
                {options.length === 0 && (
                  <CommandItem disabled>This filter takes a range, not a list</CommandItem>
                )}
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => toggle(o.value)}
                    data-checked={values.has(o.value) || undefined}
                  >
                    {o.label}
                    {/* A COUNT IS THE ONE THING A FILTER ROW HAS THAT A MENU ROW DOES NOT.
                        Real figures would come from the aggregation; these are the shape. */}
                    <CommandCount>{(o.label.length * 17) % 400}</CommandCount>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>
          The list on the left is the real registry — all
          {' '}
          {FILTERS.length}
          {' of them, in their real groups, read straight out of filterDefs.js rather '}
          than retyped.
        </strong>
        {' '}
        Type in either search box; pick a filter on the left and the right column follows.
        {' '}
        <strong style={F.strong}>What this replaces. </strong>
        The panel today hand-rolls its own search input, its own
        {' '}
        <code style={F.mono}>role=&quot;listbox&quot;</code>
        {' with a roving cursor, its own group headings and its own no-matches line — '}
        about 200 lines of keyboard and ARIA work across 35 legacy classes, all of which
        the registry ships.
        {' '}
        <strong style={F.strong}>And the finding is how LITTLE was wrong. </strong>
        Every previous kit piece needed a real correction. This one arrived on our values
        almost exactly, because
        {' '}
        <code style={F.mono}>menu.jsx</code>
        {' settled the same vocabulary on 7 Sep and the registry agrees with it: the row '}
        radius, the row text size and the hover are already the menu&rsquo;s. The wrapper
        adds ONE attribute — the panel surface, without which every row hovers to a
        card&rsquo;s value and nearly disappears.
        {' '}
        <strong style={F.strong}>It briefly did two more things and you caught
        both. </strong>
        It cancelled the shell&rsquo;s padding — which is what holds the list off the panel
        edge, so every row ran flush to the border — and moved the corner onto our card
        radius for no reason anyone had asked about. Both were applied by matching this
        component against bugs found in OTHER files, without rendering it bare and looking
        first. Both are reverted; the reasoning is kept at the top of
        {' '}
        <code style={F.mono}>command.jsx</code>
        {' because the habit matters more than the four lines.'}
      </div>
    </div>
  );
}

/* WHAT THE INSTALL ACTUALLY BROUGHT IN (owner, 2026-09-09: "I want to see what exactly
 * registry imported").
 *
 * Two reasons this is a pane rather than a paragraph. First, `@shadcn/command` is not one
 * file — it declared registryDependencies, so the CLI wrote a second component we never
 * asked for and pulled an npm package. Second, and this is the one that cost real time:
 * running it with `--overwrite` ALSO rewrote four components that were already installed
 * and already signed off, repointing each to a junk npm package named `cn`. The ratchet in
 * `ui-primitives.test.js` caught that; nothing else would have.
 *
 * The source below is the real file via Vite's `?raw`, so it is what is on disk right now.
 */
export function RegistrySource() {
  const [tab, setTab] = useState(null);
  const files = [
    ['command.jsx', commandSource],
    ['input-group.jsx', inputGroupSource],
  ];
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>Exactly what the registry installed</span>
        <span style={F.mono}>npx shadcn@latest add @shadcn/command · style base-rhea</span>
        <span style={{ flex: 1 }} />
        {files.map(([name]) => (
          <button
            key={name}
            type="button"
            style={F.tab(tab === name)}
            onClick={() => setTab(tab === name ? null : name)}
          >
            {tab === name ? 'Hide ' : 'Read '}
            {name}
          </button>
        ))}
      </div>

      <div style={F.note}>
        <strong style={F.strong}>It wrote two components, not one. </strong>
        <code style={F.mono}>ui/command.jsx</code>
        {' is the one we asked for. '}
        <code style={F.mono}>ui/input-group.jsx</code>
        {' came with it as a registry dependency — it is what draws the search field, and '}
        it is the reason the bright strip appeared: the fill sits on that wrapper rather
        than on the input.
        {' '}
        <strong style={F.strong}>It also added the </strong>
        <code style={F.mono}>cmdk</code>
        <strong style={F.strong}> package </strong>
        — the list, the filtering and the keyboard cursor are cmdk&rsquo;s, not shadcn&rsquo;s.
        shadcn ships the appearance over it.
        <br />
        <br />
        <strong style={F.strong}>And it rewrote four components we had already signed
        off. </strong>
        Because it was run with
        {' '}
        <code style={F.mono}>--overwrite</code>
        {', the CLI treated Button, Input, Textarea and Dialog as dependencies of Command '}
        and rewrote them — repointing every one at a junk npm package literally named
        {' '}
        <code style={F.mono}>cn</code>
        {', which would have silently broken every override in the app. A test caught it '}
        and all four are back to what they were. That flag does not get used again.
        <br />
        <br />
        <strong style={F.strong}>Read the source with the buttons above. </strong>
        It is the real file, pulled in at build time — not a copy — so it cannot drift from
        what is installed. Ours is byte-for-byte what the registry serves for this preset:
        that is how we know the strip was our build and not their component.
      </div>

      {files.map(([name, src]) => (tab === name ? (
        <pre key={name} style={F.code}>{src}</pre>
      ) : null))}
    </div>
  );
}

export function FilterQuestions() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>What this piece still owes</span>
        <span style={{ flex: 1 }} />
      </div>
      <div style={F.note}>
        <strong style={F.strong}>1. The count is a placeholder number, and that is the one
        thing on this page that is not real. </strong>
        The shape is right — right-aligned, tabular, quiet — but a real count means asking
        the aggregation how many trades each value would leave. That is a backend question
        (does the filter endpoint return facet counts?) rather than a design one, and it is
        worth answering before this ships: a filter list with counts is a different tool
        from one without.
        <br />
        <br />
        <strong style={F.strong}>2. Nothing is migrated. </strong>
        <code style={F.mono}>FilterPanel.jsx</code>
        {' still renders all 35 of its legacy classes and still ships. Moving it is a '}
        careful job — 529 lines, most of it keyboard behaviour you would notice
        immediately if it broke — and it happens once you have signed these parts off.
        <br />
        <br />
        <strong style={F.strong}>3. The range filter has no specimen yet. </strong>
        Lot size, R and the date presets are not lists — they are a pair of number inputs
        and a preset row. They reuse Input and Button, which are both signed off, so this
        is a composition rather than a new part. It comes with the panel migration.
      </div>
    </div>
  );
}
