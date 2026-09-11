/* KitStates — the Cycle 00 review specimens for the three states. DEV ONLY.
 *
 * Rendered by PrimitiveReview (`/test`), piece 6 — the last one. What this piece owes is
 * NOT parts: EmptyState, LoadingBlock, Skeleton and Alert are all approved already, and
 * the data table drew its own three states correctly back in piece 1. What it owes is
 * the two places §15 is not actually honoured, and both are about COVERAGE and FIDELITY
 * rather than appearance.
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING.
 */
import React from 'react';
import { Inbox } from 'lucide-react';
import {
  Button, EmptyState, ErrorState, LoadingBlock, Skeleton,
} from '@/components/primitives';

/* THE SCAFFOLD'S OWN LOOK, copied from KitFormSection so the six pieces read as one page. */
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
  col: { display: 'flex', flexDirection: 'column', gap: 10, flex: '1 1 300px', minWidth: 280 },
};

/* ══════════════════════════════════════ 1 · EMPTY AND ERROR, SIDE BY SIDE ═
 *
 * §15's own sentence is "an empty state is not an error state", and the only way to
 * judge whether that holds is to put them next to each other. They share an anatomy on
 * purpose — the same generated `Empty` shell — so what is being looked at is whether
 * three deliberate differences are enough to tell them apart at a glance.
 */
export function StatesSideBySide() {
  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>An empty state is not an error state</span>
        <span style={F.mono}>primitives/error-state.jsx · new</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          same shell · three deliberate differences
        </span>
      </div>

      <div style={{ ...F.pane, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={F.col}>
          <span style={F.label}>Empty — approved, 17 call sites</span>
          <EmptyState
            icon={<Inbox />}
            title="No trades yet"
            description="Close a trade in MT5 and it appears here instantly."
            actions={<Button variant="secondary">Add a trade manually</Button>}
          />
        </div>

        <div style={F.col}>
          <span style={F.label}>Error — new</span>
          <ErrorState
            title="Could not load your stats"
            description="The connection dropped before the numbers arrived. Your trades are safe."
            detail="GET /api/analytics/summary — 504 Gateway Timeout"
            onRetry={() => {}}
          />
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>Three differences, and each one is a rule rather than a
        preference. </strong>
        The empty state&rsquo;s edge is
        {' '}
        <strong style={F.strong}>dashed</strong>
        {' '}
        — the idiom for a space waiting to be filled, which is right for &ldquo;no trades
        yet&rdquo; and wrong for &ldquo;this failed&rdquo;; a failure is not a
        placeholder. The error&rsquo;s
        {' '}
        <strong style={F.strong}>glyph is toned and its words are not</strong>
        {' '}
        (§17 — colour on the glyph and the edge, never on the sentence). And the error
        {' '}
        <strong style={F.strong}>offers a way out</strong>
        : an empty state suggests something to do, an error asks for another go at
        something you did nothing wrong in.
        <br />
        <br />
        <strong style={F.strong}>The technical string is demoted on purpose. </strong>
        What ships today is
        {' '}
        <code style={F.mono}>Could not load stats: &#123;err&#125;</code>
        {' '}
        — one line in which a raw server message carries the same weight as the
        explanation. It is kept, because it is what makes a bug report useful, and moved
        below the sentence in mono, because it is never what the reader needs first.
      </div>
    </div>
  );
}

/* ══════════════════════════════════ 2 · THE FINDING — SEVENTY-TWO SCREENS HAVE NOTHING ═ */
export function StatesCoverage() {
  const rows = [
    ['Route-level pages in the app', '74'],
    ['…that render anything when a fetch fails', '2 — Analytics, Reports'],
    ['…that use the approved EmptyState', '17'],
    ['…that use LoadingBlock', '7'],
  ];
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>Why this piece is about coverage, not appearance</span>
        <span style={{ flex: 1 }} />
      </div>

      <div style={F.pane}>
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map(([what, n]) => (
            <div key={what} style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
              <span style={{
                ...F.mono, minWidth: 190, textAlign: 'right', color: 'var(--text)',
                fontVariantNumeric: 'tabular-nums',
              }}
              >
                {n}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{what}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>Two pages out of seventy-four. </strong>
        The other seventy-two render nothing when a load fails — in practice a blank
        region, or a skeleton that never resolves. A trader on a dropped connection
        cannot tell that apart from &ldquo;you have no trades&rdquo;, and one of those is
        a reason to close the tab. So the reason there is exactly
        {' '}
        <strong style={F.strong}>one</strong>
        {' '}
        call site to migrate is not that failures are rare — it is that the app has
        nowhere to put them.
        <br />
        <br />
        <strong style={F.strong}>And the one that exists breaks §17 twice: </strong>
        <code style={F.mono}>
          .banner.error &#123; background: var(--tint-loss-7); color: var(--loss); &#125;
        </code>
        {' '}
        — it colours the words and washes the surface, where §17 permits the glyph and
        the edge only and caps a wash at 4%. The second half is the one that matters
        here: red is the trader&rsquo;s money, and a screen washed in loss-red to report
        a timeout is speaking the language of a losing day about a network problem.
      </div>
    </div>
  );
}

/* ══════════════════════════════ 3 · LOADING — ONE SHAPE STANDING IN FOR SEVEN PAGES ═ */
export function StatesLoading() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>Loading — where §15 is not honoured yet</span>
        <span style={F.mono}>primitives/loading-block.jsx · approved 8 Sep</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>a question for you</span>
      </div>

      <div style={{ ...F.pane, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ ...F.col, flex: '1 1 420px' }}>
          <span style={F.label}>What all seven pages get</span>
          <div style={{ border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-md)' }}>
            <LoadingBlock label="Loading analytics" />
          </div>
        </div>

        <div style={{ ...F.col, flex: '1 1 300px' }}>
          <span style={F.label}>What the data table does instead — piece 1</span>
          <div style={{
            border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 12,
            display: 'grid', gap: 9,
          }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              {['62%', '48%', '74%'].map((w) => (
                <Skeleton key={w} style={{ height: 11, width: w, flex: 1 }} />
              ))}
            </div>
            {[0, 1, 2, 3, 4].map((r) => (
              <div key={r} style={{ display: 'flex', gap: 10, height: 37, alignItems: 'center' }}>
                {['55%', '68%', '44%'].map((w) => (
                  <Skeleton key={w} style={{ height: 11, width: w, flex: 1 }} />
                ))}
              </div>
            ))}
          </div>
          <span style={{ ...F.mono, lineHeight: '17px' }}>
            real rows, real 37px height, header already drawn — nothing moves when the
            trades land
          </span>
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>§15 asks for skeletons &ldquo;in the real card shells at
        the real dimensions, so nothing rearranges when data lands&rdquo;, and names the
        failure it prevents: &ldquo;a skeleton that reserves a different SHAPE from its
        content is the layout jump it exists to prevent&rdquo;. </strong>
        The data table does exactly that — piece 1 built it that way on 9 Sep.
        {' '}
        <code style={F.mono}>LoadingBlock</code>
        {' '}
        does not: it is ONE shape — a title, a KPI row and a chart — and it stands in for
        seven different pages, including
        {' '}
        <code style={F.mono}>PropAccounts</code>
        ,
        {' '}
        <code style={F.mono}>PropChallenges</code>
        {' '}
        and a cTrader account STEP, none of which is a chart page. On those it reserves
        the wrong shape and the layout jumps when data lands, which is the precise thing
        §15 forbids.
        <br />
        <br />
        <strong style={F.strong}>It is not a bug in the component, and that is why this is
        a question rather than a fix. </strong>
        <code style={F.mono}>LoadingBlock</code>
        {' '}
        is APPROVED (Batch 6, 8 Sep) and was reviewed as what it is — a page-shaped
        skeleton. Making it mirror seven different pages means either a
        {' '}
        <code style={F.mono}>shape</code>
        {' '}
        prop with an archetype per page family, or per-archetype skeletons that pages
        import directly. Both re-open a locked component, and the redesign cycles are
        where each page&rsquo;s real shell gets decided anyway — so the other honest
        option is to leave it and let each screen bring its own skeleton as it is
        rebuilt.
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════ 4 · WHICH STATE, WHEN — §15's TABLE ═ */
export function StatesRules() {
  const rows = [
    ['populated', 'the default', '—'],
    ['loading', 'a real signal (`tradesLoading`)', 'skeleton in the real shell, `aria-busy` + a label saying WHAT'],
    ['empty', 'no data at all', 'EmptyState — must not look like a bad result'],
    ['bad', 'the same signal the numbers use', 'ErrorState replaces · Alert sits on top'],
  ];
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>Which state, when</span>
        <span style={F.mono}>DESIGN-LANGUAGE §15 — locked</span>
        <span style={{ flex: 1 }} />
      </div>

      <div style={F.pane}>
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map(([state, when, rule]) => (
            <div
              key={state}
              style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}
            >
              <code style={{ ...F.mono, minWidth: 78, color: 'var(--text)' }}>{state}</code>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', minWidth: 220 }}>{when}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', flex: 1 }}>{rule}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>The line between ErrorState and Alert is whether there is
        still a page to read. </strong>
        <code style={F.mono}>Alert</code>
        {' '}
        (approved, Batch 3) is a message ON content — a form that would not submit, a
        panel that could not refresh while the rest of the screen is fine.
        {' '}
        <code style={F.mono}>ErrorState</code>
        {' '}
        REPLACES the content, because there is none. The data table already draws the
        line in the same place: its
        {' '}
        <code style={F.mono}>DataTableNotice</code>
        {' '}
        puts an Alert in a full-span cell so the table keeps its header and width rather
        than being swapped for a centred box — &ldquo;a state that replaces the whole
        table is a layout jump wearing a state&rsquo;s clothes&rdquo;.
        <br />
        <br />
        <strong style={F.strong}>Nothing is migrated. </strong>
        <code style={F.mono}>Analytics.jsx</code>
        {' '}
        still renders
        {' '}
        <code style={F.mono}>.banner error</code>
        . It moves with its screen, deleting that rule and its name in
        {' '}
        <code style={F.mono}>legacy-classes.txt</code>
        {' '}
        in the same commit — and the seventy-two screens with no error state at all get
        one as they are rebuilt.
      </div>
    </div>
  );
}
