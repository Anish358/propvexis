/* KitDrawer — the Cycle 00 review specimens for the detail drawer. DEV ONLY.
 *
 * Rendered by PrimitiveReview (`/test`), piece 4. Same method as the three pieces before
 * it: the REAL component in the real cascade, holding the REAL record, because the two
 * things actually being judged here — a 480px panel against a 384px one, and a floating
 * panel's colour against a card's — are both differences you can only settle by looking.
 *
 * AND ONE METHOD FIX CARRIED OVER FROM PIECE 3. The filter builder's wrapper was written
 * before anyone rendered the registry component untouched, so two "corrections" went in
 * matched against bugs found in OTHER files, and one of them was a regression the owner
 * caught the same day. The registry's own Sheet is therefore on this page, bare, from the
 * first commit — §25 cuts both ways, and a correction applied pre-emptively is as
 * unreviewed as a preview.
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING.
 */
import React, { useState } from 'react';
import { Pencil, Play, Trash2, X } from 'lucide-react';
import {
  Badge, Button, Separator,
  Sheet, SheetHeader, SheetTitle,
} from '@/components/primitives';
/* THE REGISTRY'S OWN, IMPORTED RAW — for the bare pane below. A page may not import
 * `components/ui`; this file is dev-only review scaffolding and is the documented
 * exception, the same one KitTooltip and KitDataTable take. */
import {
  Sheet as RawSheet, SheetContent as RawSheetContent,
  SheetHeader as RawSheetHeader, SheetTitle as RawSheetTitle,
} from '@/components/ui/sheet';
import { TRADES } from './KitDataTable.jsx';

/* THE SCAFFOLD'S OWN LOOK, copied from KitTooltip so the four pieces read as one page. */
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
  row: { display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' },
  cell: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 150 },
  label: {
    fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase',
    color: 'var(--text-3)', fontWeight: 500,
  },
  swatch: (bg) => ({
    width: 120, height: 52, background: bg, border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
  }),
};

/* THE HEADER'S ICON BUTTONS. An inline style rather than `className="h-8 w-8 p-0"`,
 * and the reason is the trap this page exists inside: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written HERE emits nothing at all — no
 * error, no warning, just a button at its default size. The full-suite run caught two of
 * these on the first commit of this file, which is the fifth and sixth time §1's list has
 * grown. A caller-supplied dimension is a PROP or a style, never a class. */
const ICON_BTN = {
  height: 32, width: 32, padding: 0, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
};

/* THE RECORD. Taken from the table's own fixture rather than retyped — brief §5 asks for
 * realistic data, and two copies of one trade is how a price gets fixed in one of them.
 * TRADES[0] is the winner with the long note; TRADES[1] is the loss that broke two rules,
 * which is what the adherence bar and the loss tone need. */
const WIN = TRADES[0];
const LOSS = TRADES[1];

const money = (v) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const price = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 5 }));
const num = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));
const time = (s) => new Date(s).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});

/* ─────────────────────────────────────────────────────── the drawer's own contents ───
 *
 * COMPOSED HERE, NOT IN THE PRIMITIVE, and that is the shape the brief asked for: §4.4
 * says the drawer is a SKIN ON SHEET, so what `sheet.jsx` owns is the panel — its width,
 * surface, motion and portal behaviour — and what a screen owns is everything inside it.
 * A `TradeDrawer` component with twenty fields hardcoded would be the Trade Log's, not
 * the kit's, and Cycle 01 is where it gets written.
 *
 * The structure below is the SHIPPED one, unchanged (§2: layouts, hierarchy and flows do
 * not move for visual work). Header, replay, timestamps, result card, adherence bar,
 * twenty-field grid, charts, notes — same order, same content, different parts.
 */

function DrawerField({ label, children, wide }) {
  const empty = children == null || children === '';
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 13, color: empty ? 'var(--text-3)' : 'var(--text)',
        fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere',
      }}
      >
        {empty ? '—' : children}
      </div>
    </div>
  );
}

/* THE RESULT CARD. `.tp-result` draws a 4px left border in the outcome's colour with the
 * figure itself tinted to match, and §17 has something to say about the second half of
 * that: colour belongs on the GLYPH and the EDGE, never on the words — but a P&L figure
 * is not a word, it is the loss itself, and §17's own carve-out is exactly that. The
 * edge and the figure both keep their tone; the LABEL under them does not. */
function ResultCard({ trade }) {
  const win = trade.fixed_r > 0;
  const flat = trade.fixed_r === 0;
  const tone = flat ? 'var(--line-strong)' : win ? 'var(--profit)' : 'var(--loss)';
  const fg = flat ? 'var(--text)' : win ? 'var(--profit-bright)' : 'var(--loss-bright)';
  return (
    <div style={{
      border: '1px solid var(--line)', borderLeft: `4px solid ${tone}`,
      borderRadius: 'var(--r-md)', padding: '14px 16px', background: 'var(--surface-sunken)',
    }}
    >
      <div style={{
        fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em',
      }}
      >
        Fixed R
      </div>
      <div style={{
        fontSize: 28, fontWeight: 600, color: fg, margin: '2px 0 4px',
        fontVariantNumeric: 'tabular-nums',
      }}
      >
        {trade.fixed_r > 0 ? '+' : ''}
        {num(trade.fixed_r, 2)}
        R
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
        {'P&L '}
        <b style={{ color: 'var(--text)', fontWeight: 500 }}>{money(trade.pnl_money)}</b>
        {' · Max R '}
        <b style={{ color: 'var(--text)', fontWeight: 500 }}>{num(trade.max_r)}</b>
      </div>
    </div>
  );
}

/* THE ADHERENCE BAR. Its glyph and edge carry the tone and its sentence does not — §17
 * as written, and the same shape `alert.jsx` took when the owner turned the tone edges
 * down to 20% on 09-08. */
function AdherenceBar({ trade }) {
  const a = trade.adherence;
  if (!a || (a.status !== 'followed' && a.status !== 'broken')) return null;
  const ok = a.status === 'followed';
  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px',
      border: `1px solid color-mix(in oklab, ${ok ? 'var(--profit)' : 'var(--warning)'} 20%, transparent)`,
      borderRadius: 'var(--r-md)', fontSize: 12.5, lineHeight: '19px', color: 'var(--text-2)',
    }}
    >
      <span style={{ color: ok ? 'var(--profit-bright)' : 'var(--warning-bright)', lineHeight: '19px' }}>
        {ok ? '✓' : '⚠'}
      </span>
      <span>
        {ok
          ? <>Followed all <b style={F.strong}>{trade.setup}</b> rules</>
          : <>Broke 2 <b style={F.strong}>{trade.setup}</b> rules: Max SL size, Session</>}
      </span>
    </div>
  );
}

/* THE HEADER, AND THE CLOSE CONTROL THAT IS ONE OF THE TWO OPEN QUESTIONS.
 *
 * `closeStyle` is REVIEW APPARATUS and it goes when the question is answered — the same
 * way the tooltip's `surface` prop and the chip's `operator` prop went, and the same way
 * piece 3's parity pane went on sign-off. It exists so both can be pointed at, not so
 * the app can have two kinds of drawer. */
function DrawerHead({ trade, onClose }) {
  const win = trade.fixed_r > 0;
  const flat = trade.fixed_r === 0;
  const long = trade.direction === 'buy';
  return (
    <SheetHeader style={{ gap: 12, padding: '20px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <SheetTitle style={{ fontSize: 18 }}>{trade.symbol_base}</SheetTitle>
          <Badge tone={long ? 'profit' : 'loss'}>{long ? 'LONG' : 'SHORT'}</Badge>
          <Badge>Closed</Badge>
          <Badge tone={flat ? 'neutral' : win ? 'profit' : 'loss'}>
            {flat ? 'Breakeven' : win ? 'Win' : 'Loss'}
          </Badge>
        </div>
        <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
          <Button variant="secondary" size="sm" aria-label="Edit trade" style={ICON_BTN}>
            <Pencil size={15} />
          </Button>
          <Button variant="secondary" size="sm" aria-label="Delete trade" style={ICON_BTN}>
            <Trash2 size={15} />
          </Button>
          {/* RULED 2026-09-10 — the close control is an ✕ IN THIS ROW, beside Edit and
            * Delete, rather than the `‹` that ships or the registry's button floating at
            * `top-4 right-4`. Closing is one of the things you can do to this record, so
            * it sits where those live. The switch that asked the question is gone. */}
          <Button
            variant="secondary"
            size="sm"
            aria-label="Close"
            onClick={onClose}
            style={ICON_BTN}
          >
            <X size={15} />
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: '18px' }}>
        {`Opened ${time(trade.open_time)} · Closed ${time(trade.close_time)} · Held 2h 37m`}
      </div>
    </SheetHeader>
  );
}

function DrawerBody({ trade }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px 32px',
      overflowY: 'auto',
    }}
    >
      <Button
        variant="secondary"
        size="sm"
        style={{ width: '100%', justifyContent: 'center', gap: 8 }}
      >
        <Play size={13} />
        Replay this trade
      </Button>

      <ResultCard trade={trade} />
      <AdherenceBar trade={trade} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px 20px' }}>
        <DrawerField label="Type">{trade.direction === 'buy' ? 'Buy' : 'Sell'}</DrawerField>
        <DrawerField label="Session">{trade.session}</DrawerField>
        <DrawerField label="Pair">{trade.symbol_base}</DrawerField>
        <DrawerField label="Setup">{trade.setup}</DrawerField>
        <DrawerField label="Probability">{trade.probability}</DrawerField>
        <DrawerField label="MTF Phase">{null}</DrawerField>
        <DrawerField label="SL Size (pips)">{num(trade.sl_size_pips, 1)}</DrawerField>
        <DrawerField label="MFE (pips)">{num(trade.mfe_pips, 1)}</DrawerField>
        <DrawerField label="Max R">{num(trade.max_r)}</DrawerField>
        <DrawerField label="Fixed R">{num(trade.fixed_r)}</DrawerField>
        <DrawerField label="Net P&L">{money(trade.pnl_money)}</DrawerField>
        <DrawerField label="Commission">{money(trade.commission)}</DrawerField>
        <DrawerField label="Volume">{num(trade.volume, 2)}</DrawerField>
        <DrawerField label="Entry">{price(trade.entry_price)}</DrawerField>
        <DrawerField label="Exit">{price(trade.exit_price)}</DrawerField>
        <DrawerField label="Stop Loss">{null}</DrawerField>
        <DrawerField label="Take Profit">{null}</DrawerField>
        <DrawerField label="Broker Symbol">{trade.symbol}</DrawerField>
        <DrawerField label="Source">EA</DrawerField>
        <DrawerField label="MT5 Ticket">{trade.id}</DrawerField>
      </div>

      <Separator />

      <div>
        <div style={{ ...F.label, marginBottom: 8 }}>Charts</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['M15', 'H1', 'H4'].map((tf) => (
            <Button key={tf} variant="secondary" size="sm">{tf}</Button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ ...F.label, marginBottom: 8 }}>Notes</div>
        <p style={{
          margin: 0, fontSize: 13, lineHeight: '21px',
          color: trade.comments ? 'var(--text-2)' : 'var(--text-3)',
        }}
        >
          {trade.comments || 'No notes for this trade.'}
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ 1 · THE DRAWER, REAL AND BARE ═
 *
 * THE TABLE'S OWN LESSON, APPLIED (owner, 2026-09-09: "I want to see the table built
 * separately, as it will be seen in the tradelog page"). The prose used to sit above the
 * component and it got in the way of looking at it. So this is the drawer, opened over
 * the real page, and the explanation is underneath.
 */
export function DrawerSpecimen() {
  const [open, setOpen] = useState(false);
  const [trade, setTrade] = useState('win');
  const row = trade === 'win' ? WIN : LOSS;

  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>The detail drawer</span>
        <span style={F.mono}>primitives/sheet.jsx · 480px · side=&quot;right&quot;</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          the card colour · an ✕ in the actions row — both yours, 10 Sep
        </span>
      </div>

      {/* THE TWO SWITCHES ARE GONE, AND THAT IS THE SIGN-OFF. They were review apparatus:
        * each existed to ask one question, both were answered on 2026-09-10, and a switch
        * that outlives its question is how one component ends up able to look like two.
        * Third time this cycle — the chip's `operator` and the tooltip's `surface` went
        * the same way, on the same rule. */}
      <div style={{ ...F.pane, ...F.row }}>
        <div style={F.cell}>
          <span style={F.label}>Open it</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => { setTrade('win'); setOpen(true); }}>A winner</Button>
            <Button variant="secondary" onClick={() => { setTrade('loss'); setOpen(true); }}>
              A loss that broke rules
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} label="Trade preview">
        <DrawerHead trade={row} onClose={() => setOpen(false)} />
        <DrawerBody trade={row} />
      </Sheet>

      <div style={F.note}>
        <strong style={F.strong}>That is the trade drawer. </strong>
        Twenty fields, a result card, the adherence sentence, the charts and the note —
        the same content in the same order as the one that ships, because §2 locks
        structure and a visual pass does not get to drop a field. What is different is
        underneath: this one is the registry&rsquo;s Base UI dialog, so it traps focus,
        restores it to the row you came from, closes on Escape and on an outside click,
        and marks itself as modal to a screen reader.
        {' '}
        <strong style={F.strong}>The one that ships does none of those things. </strong>
        It is a <code style={F.mono}>div</code> with a click handler, a
        {' '}
        <code style={F.mono}>role=&quot;dialog&quot;</code>
        {' '}
        with no
        {' '}
        <code style={F.mono}>aria-modal</code>
        , and a hand-rolled document-level Escape listener. None of that is what you are
        being asked to judge — it comes free with the component — but it is the reason
        this piece is a replacement rather than a repaint.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ 2 · THE REGISTRY'S OWN, RENDERED BARE ═
 *
 * THIS PANE EXISTS BECAUSE PIECE 3 DID NOT HAVE ONE IN TIME. The filter builder's wrapper
 * was written against faults found in other files rather than against anything visible
 * here, and one of those "corrections" ran every row flush to the panel edge. The rule
 * that came out of it: render it untouched, LOOK, then fix one thing.
 *
 * So this is `ui/sheet.jsx` with nothing of ours on it — no width, no surface attribute,
 * no motion, and the registry's own floating close button left on. Two differences are
 * visible immediately and both are in the notes below.
 */
export function DrawerRegistry() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>The registry&rsquo;s Sheet, with none of our layer on it</span>
        <span style={F.mono}>ui/sheet.jsx, imported directly</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          384px · the registry&rsquo;s close button · `ease-in-out`
        </span>
      </div>

      <div style={{ ...F.pane, ...F.row }}>
        <div style={F.cell}>
          <span style={F.label}>Untouched</span>
          <Button variant="secondary" onClick={() => setOpen(true)}>Open the bare one</Button>
        </div>
        <div style={F.cell}>
          <span style={F.label}>Our width vs the registry&rsquo;s</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <div style={{ ...F.swatch('var(--surface-2)'), width: 192 }} />
              <div style={{ ...F.mono, marginTop: 5 }}>480px — ours</div>
            </div>
            <div>
              <div style={{ ...F.swatch('var(--surface-2)'), width: 154 }} />
              <div style={{ ...F.mono, marginTop: 5 }}>384px — sm:max-w-sm</div>
            </div>
          </div>
        </div>
      </div>

      <RawSheet open={open} onOpenChange={setOpen}>
        <RawSheetContent side="right">
          <RawSheetHeader>
            <RawSheetTitle>{WIN.symbol_base}</RawSheetTitle>
          </RawSheetHeader>
          <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px 20px' }}>
            <DrawerField label="Entry">{price(WIN.entry_price)}</DrawerField>
            <DrawerField label="Exit">{price(WIN.exit_price)}</DrawerField>
            <DrawerField label="Net P&L">{money(WIN.pnl_money)}</DrawerField>
            <DrawerField label="Commission">{money(WIN.commission)}</DrawerField>
            <DrawerField label="Broker Symbol">{WIN.symbol}</DrawerField>
            <DrawerField label="MT5 Ticket">{WIN.id}</DrawerField>
          </div>
        </RawSheetContent>
      </RawSheet>

      <div style={F.note}>
        <strong style={F.strong}>Three things this pane is showing, and one non-event. </strong>
        The <b style={F.strong}>width</b> is the real correction: `sm:max-w-sm` is 384px,
        and it is a sensible default for a component that does not know what goes in it.
        We know — a twenty-field two-column grid — and at 384px the prices in it start
        wrapping, which is unreadable in a way a wrapped sentence is not. 480px is what
        ships today and it was arrived at by looking at this grid.
        {' '}
        The <b style={F.strong}>close button</b> floats at `top-4 right-4`; ours sits in
        the header. That is question 2 above.
        {' '}
        The <b style={F.strong}>curve</b> is `ease-in-out`, the browser&rsquo;s, where
        every other overlay in the app uses `--ease`; and the registry uses one duration
        in both directions where §10 says leaving is faster than arriving.
        <br />
        <br />
        <strong style={F.strong}>The non-event: the duration is already ours. </strong>
        The registry animates at `duration-200` and `--dur` is 200ms — the second time in
        two pieces that a registry value turned out to be the one we would have picked.
        Worth stating rather than silently keeping, because &ldquo;it matched&rdquo; and
        &ldquo;nobody checked&rdquo; look identical afterwards.
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════ 3 · WHAT WAS DECIDED, AND WHAT IS NOT ═ */
export function DrawerQuestions() {
  return (
    <div style={{ ...F.card, background: 'var(--surface-sunken)' }}>
      <div style={F.head}>
        <span style={F.name}>What you decided, and the two notes that outlive it</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>10 Sep 2026</span>
      </div>

      <div style={{ ...F.pane, ...F.row }}>
        <div style={F.cell}>
          <span style={F.label}>Chosen — the card colour</span>
          <div style={F.swatch('var(--surface)')} />
          <span style={F.mono}>--surface · #111114</span>
        </div>
        <div style={F.cell}>
          <span style={F.label}>Not chosen — the floating panel</span>
          <div style={{ ...F.swatch('var(--surface-2)'), opacity: 0.45 }} />
          <span style={{ ...F.mono, opacity: 0.6 }}>--surface-2 · what the registry draws</span>
        </div>
      </div>

      <div style={F.note}>
        <strong style={F.strong}>1. The drawer is a CARD-coloured surface, not a floating
        panel. </strong>
        It went against the registry, which draws
        {' '}
        <code style={F.mono}>bg-popover</code>
        {' '}
        — and against the token&rsquo;s own description of itself, which lists
        {' '}
        <em>every floating panel</em>
        . That list turned out to describe the things that had needed it rather than define
        what qualifies: every previous holder is small and transient, and this one is 480px
        wide, full height, and holds a card, twenty fields and a paragraph. It is a place
        you go to read.
        {' '}
        <strong style={F.strong}>
          The consequence is the half worth remembering:
        </strong>
        {' '}
        <code style={F.mono}>data-overlay-surface</code>
        {' '}
        came off with it. The same attribute that sets the panel&rsquo;s colour is what
        makes every hover, edge and separator inside resolve to overlay values — keeping it
        on a card-coloured surface would have produced exactly the fault it exists to
        prevent, inverted. The registry&rsquo;s own
        {' '}
        <code style={F.mono}>border-l</code>
        {' '}
        now lands on a card&rsquo;s edge with no override, which is what
        {' '}
        <code style={F.mono}>.tp-panel</code>
        {' '}
        has always drawn.
        <br />
        <br />
        <strong style={F.strong}>2. The close control is an ✕ in the actions row. </strong>
        Neither of the two obvious answers: not the
        {' '}
        <code style={F.mono}>‹</code>
        {' '}
        that ships to the left of the title, and not the registry&rsquo;s button floating
        at
        {' '}
        <code style={F.mono}>top-4 right-4</code>
        . Closing is one of the things you can do to this record, so it sits beside Edit
        and Delete where those live. The registry&rsquo;s stays forced off — its is
        absolutely positioned over the panel, and having both would be two controls doing
        one job.
        <br />
        <br />
        <strong style={F.strong}>Note — the drawer is being redesigned later (owner,
        10 Sep). </strong>
        What is signed here is the
        {' '}
        <strong style={F.strong}>shell</strong>
        {' '}
        — the panel&rsquo;s width, surface, motion, edge and portal behaviour, which is
        all
        {' '}
        <code style={F.mono}>primitives/sheet.jsx</code>
        {' '}
        contains. Everything inside it on this page is composed by the specimen, not by the
        primitive, and it is deliberately the SHIPPED structure rather than a proposal
        (§2). So a later redesign of what the drawer shows is not a reopening of this
        component, and this component is not a reason the redesign has to keep twenty
        fields in two columns.
        <br />
        <br />
        <strong style={F.strong}>Note — nothing is migrated. </strong>
        <code style={F.mono}>TradePreview.jsx</code>
        {' '}
        still renders its 26
        {' '}
        <code style={F.mono}>.tp-*</code>
        {' '}
        classes and still ships in the Trade Log and the Day view. It moves in Cycle 01,
        and that commit deletes those rules and their names in
        {' '}
        <code style={F.mono}>legacy-classes.txt</code>
        {' '}
        together. Signing this off is not the same as having migrated it, and a test says so.
      </div>
    </div>
  );
}
