/* RadiusCheck — does the preset ladder actually DRAW? DEV ONLY.
 *
 * Built 2026-09-09, and rewritten the same day when the preset moved again — to
 * b2qLMFPO4 (radius SMALL), where every rung derives from one base rather than sitting on
 * a ladder of ours. The owner asked to see a badge, a checkbox and a small button "to see
 * if everything works right", and those three are not a random sample: they are three of
 * the four components that clamped under the old ladder.
 *
 * THE 'ASKS FOR' COLUMN IS NOT HARD-CODED ANY MORE. It used to be — and it went stale
 * within hours, twice, which on a page whose whole job is to be trustworthy is the worst
 * kind of bug. It now reads the same computed value the browser resolved, so the row
 * cannot claim a number the element is not wearing.
 *
 * IT MEASURES ITSELF, because this is the one property you cannot review by eye. A radius
 * draws only up to HALF the shorter side of its box, and past that the browser silently
 * clamps: a 16px corner on a 20px badge is a pill whatever the number says. So each row
 * below reads the REAL element after layout — `getComputedStyle` for the radius it asks
 * for, `getBoundingClientRect` for the height it got — and does the arithmetic on screen.
 *
 * WHY COMPUTED STYLE IS NOT THE WHOLE ANSWER, and the row says so rather than pretending:
 * `borderRadius` in computed style is the SPECIFIED length, not the clamped result. The
 * browser does not expose what it drew. So the row reports asked-for, box, half, and
 * whether the first exceeds the last — which is the same sum the browser performs, done
 * where you can see it.
 *
 * INLINE STYLES for the scaffolding, per this page's rule: Tailwind's `@source` covers
 * `components/{ui,primitives}` only, so a utility written here emits NOTHING. The
 * specimens themselves are the real primitives.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Badge, Button, ButtonLabel, Checkbox, FilterChip,
} from '@/components/primitives';

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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: {
    textAlign: 'left', padding: '9px 18px', fontSize: 10.5, letterSpacing: '.07em',
    textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 500,
    borderBottom: '1px solid var(--line-inset)', whiteSpace: 'nowrap',
  },
  td: {
    padding: '11px 18px', borderBottom: '1px solid var(--line-inset)',
    color: 'var(--text-2)', verticalAlign: 'middle',
  },
  num: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' },
  ok: { color: 'var(--profit-bright)', fontWeight: 600 },
  bad: { color: 'var(--warning-bright)', fontWeight: 600 },
};

/* One row: render the real component, then measure what the browser gave it.
 *
 * TWO FRAMES BEFORE MEASURING. One is not enough — the first paint can land before the
 * webfont has swapped, and a text control's height follows its font. Measuring early
 * reported a 26px button as 24px, which would have looked like a clamp that was not there. */
function Row({ what, children, note }) {
  const host = useRef(null);
  const [m, setM] = useState(null);

  useEffect(() => {
    let live = true;
    const read = () => {
      const el = host.current?.firstElementChild;
      if (!el || !live) return;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      setM({
        radius: parseFloat(cs.borderTopLeftRadius) || 0,
        side: Math.min(box.height, box.width),
      });
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(read));
    return () => { live = false; cancelAnimationFrame(id); };
  }, []);

  const half = m ? Math.round(m.side / 2 * 10) / 10 : null;
  const clamps = m ? m.radius >= half : null;

  return (
    <tr>
      <td style={F.td}><div ref={host} style={{ display: 'inline-flex' }}>{children}</div></td>
      <td style={{ ...F.td, color: 'var(--text)' }}>{what}</td>
      <td style={{ ...F.td, ...F.num }}>{m ? `${m.radius}px` : '…'}</td>
      <td style={{ ...F.td, ...F.num }}>{m ? `${Math.round(m.side * 10) / 10}px` : '…'}</td>
      <td style={{ ...F.td, ...F.num }}>{half != null ? `${half}px` : '…'}</td>
      <td style={{ ...F.td, ...(clamps ? F.bad : F.ok) }}>
        {m == null ? '…' : (clamps ? `clamps → ${half}px` : 'draws in full')}
      </td>
      <td style={{ ...F.td, fontSize: 12, color: 'var(--text-3)' }}>{note}</td>
    </tr>
  );
}

export function RadiusCheck() {
  return (
    <div style={F.card}>
      <div style={F.head}>
        <span style={F.name}>Radius check — the preset ladder, measured on the real elements</span>
        <span style={F.mono}>b2qLMFPO4 · --radius 0.45rem · x0.6 .. x2.6</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>read after layout, not by eye</span>
      </div>

      <table style={F.table}>
        <thead>
          <tr>
            <th style={F.th}>The thing</th>
            <th style={F.th}>What it is</th>
            <th style={{ ...F.th, textAlign: 'right' }}>Computed</th>
            <th style={{ ...F.th, textAlign: 'right' }}>Box</th>
            <th style={{ ...F.th, textAlign: 'right' }}>Half</th>
            <th style={F.th}>Result</th>
            <th style={F.th}>Why</th>
          </tr>
        </thead>
        <tbody>
          <Row
            what="Tick box"
            note="the registry's own corner — our override is deleted"
          >
            <Checkbox aria-label="Radius check" checked />
          </Row>

          <Row
            what="Badge"
            note="the preset's 2xl on a 20px box — still a pill, and still the preset saying so"
          >
            <Badge tone="profit">Followed</Badge>
          </Row>

          <Row
            what="Small button"
            note="2xl on a 28px box — it DRAWS now; under the old ladder's 16px it clamped"
          >
            <Button size="sm"><ButtonLabel>Save</ButtonLabel></Button>
          </Row>

          <Row
            what="Small button, chrome"
            note="the Clear on the filter strip — same 2xl as every other button variant"
          >
            <Button variant="chrome" size="sm"><ButtonLabel>Clear</ButtonLabel></Button>
          </Row>

          <Row
            what="Filter chip"
            note="hand-written, so it borrows a badge's corner — the only part with no registry twin"
          >
            {/* NOT WRAPPED IN <FilterChips>, and that was a real bug in this pane: the row
                measures `firstElementChild`, so the wrapper's 0px radius was reported as
                the chip's. A measuring tool that measures the wrong element is worse than
                no tool — it reads as evidence. The chip is `inline-flex`, so it stands
                alone here. */}
            <FilterChip field="Session" value="London" onEdit={() => {}} onRemove={() => {}} />
          </Row>
        </tbody>
      </table>

      <div style={F.note}>
        <strong style={F.strong}>Read the last two columns. </strong>
        &ldquo;Draws in full&rdquo; means the corner you asked for is the corner on screen.
        &ldquo;Clamps&rdquo; means the box is too small to hold it and the browser drew half
        the box instead — silently, which is why this is a table and not a look.
        {' '}
        <strong style={F.strong}>The tick box is the one that went wrong before </strong>
        and it is the row to check first: it was a rounded square when you approved it, and
        a perfect circle the next day when our
        {' '}
        <code style={F.mono}>--r-sm</code>
        {' hit exactly half of its 16px box. It now takes the registry’s own 5px, which is '}
        well under half, so it draws as a square.
        <br />
        <br />
        <strong style={F.strong}>The badge and the plain small button still clamp, and that
        is the preset doing it, not us. </strong>
        Both ask for 16px — the preset&rsquo;s control step — on boxes of 20px and 28px, so
        both come out as pills. That is what shadcn draws at those sizes, and §6 says it in
        as many words: &ldquo;controls and badges are ALREADY pills, and that question is
        closed&rdquo;. The difference from before is WHERE the decision comes from: it is
        the preset&rsquo;s arithmetic now, not our ladder sitting a step above it.
        {' '}
        <strong style={F.strong}>Chrome and the chip were the last two holdouts, and you
        found them in this table. </strong>
        Both sat at 8px — chrome because §6 gave quiet controls a step of their own, the chip
        because it is hand-written and I picked one. Neither was the preset&rsquo;s: every
        generated button variant, ghost included, asks for
        {' '}
        <code style={F.mono}>rounded-2xl</code>
        {'. Both take it now, so every row above is on a preset step and nothing in the '}
        library overrides a generated corner. A test enforces that last part.
        {' '}
        <strong style={F.strong}>The cost is that both became pills, </strong>
        for the same arithmetic as the badge. That is the preset&rsquo;s answer rather than
        ours — but it does make the chip less like the Linear reference you matched it to,
        which is worth a look before you keep it.
      </div>
    </div>
  );
}
