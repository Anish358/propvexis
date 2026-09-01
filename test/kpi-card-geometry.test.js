import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSrc } from './helpers/src-files.js';

/* THE KPI ROW'S GEOMETRY, PINNED TO THE PROTOTYPE.
 *
 * The row is five cards that must read as one object, and two of them are laid out
 * differently inside: the hero is a column (label over figure) and the other four are a
 * row (label+figure against a gauge). Nothing forces those two to agree — they agreed
 * only because someone chose insets that made them agree, which is precisely the kind of
 * agreement that decays silently.
 *
 * It decayed once already: the card shipped at 118px with a flat 18px inset, the
 * non-hero stack centred itself against its gauge, and a spacer pinned the hero's figure
 * to the floor. The result was a Net P&L label sitting above its neighbours' and a Net
 * P&L figure sitting below theirs — visible in a screenshot, invisible in the source.
 *
 * So the arithmetic is the test: hero top inset == non-hero card inset + non-hero stack
 * inset. If someone changes one number, this fails and names the other.
 */

const kpi = readSrc('components/primitives/kpi.jsx');

const px = (re, what) => {
  const m = re.exec(kpi);
  assert.ok(m, `could not find ${what} — the class shape changed, so this test is now blind`);
  return Number(m[1]);
};

test('hero and non-hero cards put their label rows on the SAME line', () => {
  const heroTop = px(/hero\s*\n\s*\?\s*'[^']*pt-\[(\d+)px\]/, "the hero's top inset");
  const bodyTop = px(/:\s*'[^']*pt-\[(\d+)px\]/, "the non-hero card's top inset");
  const stackTop = px(/kpi-main[\s\S]*?pt-\[(\d+)px\]/, "KpiMain's top inset");

  assert.equal(
    heroTop, bodyTop + stackTop,
    `the hero pads ${heroTop} from the top; the others pad ${bodyTop} + ${stackTop} = ${bodyTop + stackTop}. ` +
    'Those must be equal or the Net P&L label sits off the line the other four share.',
  );
  // The prototype's numbers, so a change that keeps the sum but moves both is still caught.
  assert.equal(heroTop, 28);
  assert.equal(bodyTop, 22);
  assert.equal(stackTop, 6);
});

test('every card is the same height and the same 13px internal rhythm', () => {
  assert.match(kpi, /min-h-\[128px\]/, 'the card floor must be the prototype 128px');
  // One gap value, used by the hero card itself and by the non-hero inner stack — the
  // figure sits the same distance under its label on all five.
  const heroGap = px(/hero\s*\n\s*\?\s*'[^']*gap-\[(\d+)px\]/, "the hero's internal gap");
  const stackGap = px(/kpi-main[\s\S]*?gap-\[(\d+)px\]/, "KpiMain's gap");
  assert.equal(heroGap, 13);
  assert.equal(stackGap, 13);
  assert.equal(heroGap, stackGap, 'the label-to-figure distance must not differ by card');
});

test('the figure is never pushed to the floor of the card', () => {
  // KpiSpacer did that, and it is why the hero's number sat below the other four.
  assert.ok(!/export function KpiSpacer/.test(kpi), 'KpiSpacer is back — see this file’s header');
  const dashboard = readSrc('features/dashboard/Dashboard.jsx');
  const cards = readSrc('features/dashboard/KpiCards.jsx');
  for (const [name, src] of [['Dashboard.jsx', dashboard], ['KpiCards.jsx', cards]]) {
    assert.ok(!/<KpiSpacer/.test(src), `${name} still renders a KpiSpacer`);
  }
});

test('the gauge centres on the card, not on the label stack', () => {
  // `self-stretch` is what lets KpiMain be positioned from the top: without it the
  // aside is only as tall as its content and `justify-center` centres against the
  // stack, which drags the two arrangements apart again.
  assert.match(kpi, /kpi-aside[\s\S]*?justify-center[\s\S]*?self-stretch/,
    'KpiAside must stretch to the card and centre within it');
  assert.ok(!/kpi-main[\s\S]{0,200}justify-center/.test(kpi),
    'KpiMain must not centre itself — that is the bug this row already had');
});

test('the outcome reds are the lighter step (owner call)', () => {
  /* The prototype writes #22c55e/#ef4444 for the hero figure and the profit-factor
   * ring. At 25px of mono on a raised card the structural red reads heavy and slightly
   * muddy, and at ring scale it is the single largest area of colour in the row — the
   * owner asked for the lighter step in both. That is a legal move rather than a drift:
   * both are the outcome family §4 reserves for exactly this, and the bright pair is
   * already what the trade rows one card over use. */
  const kpiSrc = readSrc('components/primitives/kpi.jsx');
  assert.match(kpiSrc, /pos: 'var\(--profit-bright\)'/);
  assert.match(kpiSrc, /neg: 'var\(--loss-bright\)'/);
  assert.match(kpiSrc, /stroke=\{empty \? 'var\(--chart-grid\)' : 'var\(--loss-bright\)'\}/);
  // The ring's PROFIT arc keeps the structural green on purpose: it is drawn over the
  // red base, not on the card, so it is the one place the structural colour carries.
  assert.match(kpiSrc, /stroke="var\(--profit\)"/);
});
