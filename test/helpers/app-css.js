import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Phase 3c split `frontend/src/styles.css` into `styles/tokens.css` (every design
// token) and `styles/legacy/app.css` (every component rule, verbatim). Their
// concatenation is byte-identical to the file that used to exist — the split was
// verified lossless — so tests that assert over "the stylesheet" read this and
// keep asserting over exactly the same CSS.
//
// `bridge.css` is not part of `appCss`, and the reason has narrowed since it was
// written. It still declares no values — it only maps our tokens into Tailwind's
// namespace — so a test asking "what does this app look like" reads tokens and
// components, not the mapping.
//
// But as of 2026-08-05 the mapping is load-bearing for appearance in a way it was not
// before. With the preset skin adopted (DESIGN-LANGUAGE, "the preset outranks legacy
// CSS"), a generated component asks for `rounded-2xl` and `shadow-lg` and the bridge is
// the only thing that makes those land on OUR scale instead of Tailwind's defaults. So
// it is exported separately: tests that assert on a preset-skinned surface must read it,
// and they should have to say so rather than getting it by accident in `appCss`.
// LF whatever the checkout used — the reasoning is on `lf` in helpers/src-files.js.
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
  .split('\r\n').join('\n');

export const tokensCss = read('../../frontend/src/styles/tokens.css');
export const legacyCss = read('../../frontend/src/styles/legacy/app.css');
export const bridgeCss = read('../../frontend/src/styles/bridge.css');
export const appCss = tokensCss + legacyCss;

/* ── THE RESOLVED RADIUS SCALE ────────────────────────────────────────────────────────
 *
 * Added 2026-09-09, when the ladder stopped being a table of pixels. Preset b2qLMFPO4
 * ships ONE base (`--radius` in tokens.css) and seven multipliers (`--radius-*` in
 * bridge.css), so no radius token holds a number any more — `--r-md` is
 * `var(--radius-md)` is `calc(var(--radius) * 0.8)`.
 *
 * Two tests used to read those as integers with `/^(\d+)px/` and both went silent the
 * moment the values became expressions — a regex that matches nothing returns nothing, and
 * `radius-clamp.test.js` has a paragraph about how that failure mode is worse than no test.
 * So the resolution lives here, ONCE, and both read it: a second copy would be a second
 * thing to update the next time the preset's formula changes.
 *
 * IT DOES THE ARITHMETIC THE BROWSER DOES, and nothing cleverer — parse the base, parse
 * each multiplier out of the calc(), multiply. If bridge.css ever flattens the rungs to
 * literals this still works, because a rung with no multiplier is read as its own value.
 */
export function radiusScale() {
  const base = /--radius:\s*([\d.]+)(rem|px)\s*;/.exec(tokensCss);
  if (!base) throw new Error('--radius is not declared in tokens.css — the scale has no base');
  const px = Number(base[1]) * (base[2] === 'rem' ? 16 : 1);

  const rung = { base: px };
  for (const step of ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl']) {
    const line = new RegExp(`--radius-${step}:\\s*([^;]+);`).exec(bridgeCss);
    if (!line) throw new Error(`--radius-${step} is not declared in bridge.css`);
    const expr = line[1].trim();
    const mult = /calc\(\s*var\(--radius\)\s*\*\s*([\d.]+)\s*\)/.exec(expr);
    if (mult) { rung[step] = px * Number(mult[1]); continue; }
    if (/^var\(--radius\)$/.test(expr)) { rung[step] = px; continue; }
    const lit = /^([\d.]+)(px|rem)$/.exec(expr);
    if (lit) { rung[step] = Number(lit[1]) * (lit[2] === 'rem' ? 16 : 1); continue; }
    throw new Error(`--radius-${step} is "${expr}", which radiusScale() cannot resolve`);
  }

  /* A CARD reads `min(--radius-4xl, 24px)` — the generated card's own expression, which
   * `--r-card` mirrors so a legacy card and a generated one cannot disagree. */
  rung.card = Math.min(rung['4xl'], 24);
  return rung;
}
