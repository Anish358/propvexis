import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { titleCase } from '../frontend/src/lib/constants.js';

import { appCss } from './helpers/app-css.js';
import { appJsx, libraryFiles, readSrc, stripComments } from './helpers/src-files.js';
// TYPOGRAPHY RULE: this app writes in Title Case. Never SHOUTED — not via
// `text-transform: uppercase` in CSS, not by `.toUpperCase()` on display text, and
// not by typing a label in caps in the markup.
//
// Why it's a test and not a note: all-caps creeps back one label at a time, and it
// only looks wrong once several have accumulated. Caught here instead.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = appCss;
// Every application .jsx, wherever the tree puts it — the component library is
// excluded, as it was when this scan read a flat src/ directory.
const jsxFiles = appJsx();

// The ONE documented exception. A wordmark is a logo, not UI text: its letterforms
// and tracking are the brand's, and title-casing it would be redrawing the mark.
const CAPS_EXCEPTIONS = ['.auth-mark'];

/* THE RULE NOW COVERS THE COMPONENT LIBRARY TOO (2026-08-28), and it had to: it only
 * ever scanned legacy CSS, so the redesign could have introduced `uppercase` in a
 * primitive and never been asked about it. That is not hypothetical — Today's Brief
 * needed exactly one, and this is where it had to come and argue for itself.
 *
 * The exception is the brief's column eyebrows ("HIGH & MEDIUM EVENTS", "ACCOUNT
 * ALERTS"): 12px, medium weight, muted, letterspaced, naming a column rather than
 * saying anything. That is the one register where small caps reads as structure instead
 * of emphasis, and the Figma frame draws them that way. Anything larger, darker, or in
 * a sentence is shouting and belongs in title case. */
const UPPERCASE_EXCEPTIONS = [
  { file: 'components/primitives/brief.jsx', what: "the brief's column eyebrows" },
  /* THE RAIL'S "SOON" BADGE (added 2026-08-29, Rhea). 10px, letterspaced, muted, on a
   * quiet fill beside a nav item it qualifies. That is the same register the brief's
   * eyebrows occupy and the one §3 exempts: a small muted caps run naming a STATE
   * rather than saying anything reads as structure, not emphasis. The design draws it
   * that way, and at title case ("Soon") it competed with the label it is subordinate
   * to. Anything larger, darker, or in a sentence is still shouting. */
  { file: 'components/primitives/rail.jsx', what: "the rail's Soon state badge" },
  /* THE ACCOUNT CARD'S TWO (added 2026-08-29, Rhea): a meter's rule name ("DAILY
   * DRAWDOWN") and the stop-trading banner's label. Both are 11-12.5px, letterspaced,
   * and name a thing rather than say one — the same eyebrow register §3 exempts.
   *
   * The banner is the one caps run in this app that is NOT muted, and it argues for
   * itself: it is the single most urgent string the product can show, it appears only
   * when an account is inside its stop-trading zone, and it is the redundant encoding
   * that keeps severity legible without colour. Caps as structure, and once. */
  { file: 'components/primitives/account.jsx', what: "meter eyebrows and the stop-trading label" },
];

test('no uppercase text-transform outside the brand wordmark', () => {
  const offenders = [];
  // Rule-block scan, so a selector list spanning lines is still attributed right.
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    if (!/text-transform:\s*uppercase/.test(body)) continue;
    if (CAPS_EXCEPTIONS.some((k) => sel.includes(k))) continue;
    offenders.push(sel.trim().split('\n').pop().trim().slice(0, 70));
  }
  assert.deepEqual(offenders, [], `these rules SHOUT — use title case instead:\n${offenders.join('\n')}`);
});

test('the wordmark exception is still there and still marked', () => {
  // If the exception is deleted the test above passes vacuously, so assert it.
  const at = css.indexOf('.auth-mark');
  assert.ok(at > -1, '.auth-mark is gone — drop it from CAPS_EXCEPTIONS too');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.match(rule, /text-transform: uppercase/);
});

test('display text is not uppercased in JS', () => {
  // `.toUpperCase()` on a VALUE being shown to a person is the same rule broken in
  // a different place. Normalizing stored DATA is fine (a symbol is EURUSD), as is
  // taking a single initial for an avatar.
  /* COMMENTS ARE BLANKED FIRST, not stripped, and the difference matters: replacing a
   * comment with an empty line keeps every later line at its real number, so an offender
   * is still reported at the line you can go and look at.
   *
   * Why at all — a rule about `.toUpperCase()` cannot be explained in a file it scans
   * without the explanation tripping it. That is not hypothetical: the note above
   * `initials()` in Sidebar.jsx names the method it is justifying, and this test failed
   * on the prose while the code beneath it was exactly what the rule permits. Third
   * scanner in this suite to learn it (see utility-collisions.test.js). */
  const offenders = [];
  for (const f of jsxFiles) {
    // stripComments preserves newlines in both comment forms, so indices still line up
    // with the real file and a reported line number is one you can open.
    stripComments(readSrc(f)).split('\n').forEach((line, i) => {
      if (!line.includes('.toUpperCase()')) return;
      if (/charAt\(0\)|\.trim\(\)\.charAt|symbols|slug/.test(line)) return;   // initials / data
      if (/titleCase/.test(line)) return;
      offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, [], `uppercased display text — use titleCase():\n${offenders.join('\n')}`);
});

test('labels are not typed in caps in the markup', () => {
  // Acronyms and unit/timeframe symbols are not shouting — MFE, P&L, M15, R, USD
  // are how those things are written.
  const ALLOWED = /^(P&L|P\/L|R|BE|MFE|SL|MTF|M15|H1|H4|CSV|EA|API|ROI|USD|GBP|EUR|JPY|MT4|MT5|ID|UTC|RR|AI|OK|NY|LDN|ASIA|HIGH|MED|LOW|TOTAL)$/;
  const offenders = [];
  for (const f of jsxFiles) {
    for (const m of readSrc(f).matchAll(/>([A-Z][A-Z0-9 /&'-]{2,})</g)) {
      const text = m[1].trim();
      // Split on whitespace only — a slashed pair like P/L is one written token.
      if (text.split(/\s+/).every((w) => ALLOWED.test(w))) continue;
      offenders.push(`${f}: "${text}"`);
    }
  }
  assert.deepEqual(offenders, [], `caps labels in markup — write them in title case:\n${offenders.join('\n')}`);
});

test('titleCase handles the values it is given', () => {
  assert.equal(titleCase('pro'), 'Pro');
  assert.equal(titleCase('SELL'), 'Sell');
  assert.equal(titleCase('free'), 'Free');
  // Empty in, empty out — callers render `titleCase(x) || '—'`.
  assert.equal(titleCase(''), '');
  assert.equal(titleCase(null), '');
  assert.equal(titleCase(undefined), '');
});

test('caps tracking went with the caps', () => {
  // Wide letter-spacing exists to open up all-caps; left behind on title case it
  // reads as loose, badly-set text. Spot-check the labels that were converted.
  for (const sel of ['.kpi-label', '.dc-tile-label', '.jo-kpi-label', '.dv-bar-label', '.fp-field-label']) {
    const at = css.indexOf(`${sel} {`);
    assert.ok(at > -1, `${sel} not found`);
    const rule = css.slice(at, css.indexOf('}', at));
    // An explicit `letter-spacing: 0` is the fix, not the offence — only a
    // non-zero value is leftover caps tracking.
    const tracking = rule.match(/letter-spacing:\s*(-?[.0-9]+)/);
    assert.ok(!tracking || Number(tracking[1]) === 0, `${sel} still carries caps tracking`);
  }
});

test('no `uppercase` utility outside the one place it is argued for', () => {
  // Utilities compile only under components/{ui,primitives}, so that is the whole
  // surface. A page cannot introduce one — its class would emit nothing at all.
  const offenders = [];
  for (const f of libraryFiles()) {
    if (UPPERCASE_EXCEPTIONS.some((e) => f.endsWith(e.file))) continue;
    if (/\buppercase\b/.test(stripComments(readSrc(f)))) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `these SHOUT — use title case:\n${offenders.join('\n')}`);
});

test('each uppercase exception is still real', () => {
  // If an exempted file stops using it, the exemption is dead weight that would let the
  // next one in unnoticed — the same reason the .auth-mark exception is asserted above.
  for (const { file, what } of UPPERCASE_EXCEPTIONS) {
    assert.match(stripComments(readSrc(file)), /\buppercase\b/,
      `${file} no longer uppercases anything (${what}) — drop it from UPPERCASE_EXCEPTIONS`);
  }
});
