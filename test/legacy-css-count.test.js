import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* THE REDESIGN'S PROGRESS BAR, AND WHY IT IS A TEST RATHER THAN A COMMENT.
 *
 * The Test page shows how many class names `styles/legacy/app.css` still declares, because
 * that is the honest measure of the screen redesign: a screen can be redesigned and still
 * leave its old rules behind, which the plan's own definition of done calls the step that
 * gets skipped. "Screens completed" would not catch that; this does.
 *
 * A NUMBER WRITTEN INTO A PAGE IS A NUMBER THAT ROTS. This session found seven separate
 * comments describing a state of the world that had moved — a workaround for a collision
 * fixed weeks earlier, a component held back for an opinion the library had adopted, a
 * count copied from a previous prune. Every one had been written carefully, which is what
 * made it durable and wrong.
 *
 * So the figure is derived here and compared. When a cycle deletes a screen's CSS this
 * fails, and the fix is to read the new number off the failure and put it in the page —
 * one line, and the page cannot silently lie in the meantime.
 */

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/* Comments stripped first: `app.css` discusses class names it no longer declares — on
 * purpose, since several of those notes exist to explain what was deleted and why. Counting
 * prose would make the number climb as the file is documented. */
function declaredClasses(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return new Set([...code.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
}

test('the Test page reports the real legacy class count', () => {
  const actual = declaredClasses(read('../frontend/src/styles/legacy/app.css')).size;
  const page = read('../frontend/src/features/dev/PrimitiveReview.jsx');
  const declared = /const LEGACY_CLASSES = (\d+);/.exec(page);

  assert.ok(declared, 'PrimitiveReview.jsx must declare LEGACY_CLASSES');
  assert.equal(
    Number(declared[1]), actual,
    `The Test page says legacy/app.css declares ${declared[1]} class names; it declares `
      + `${actual}. Set LEGACY_CLASSES to ${actual}. If it went DOWN, a cycle just deleted `
      + 'a screen\'s CSS and the page should say so; if it went UP, something added to a '
      + 'stylesheet that is supposed to be shrinking to nothing.',
  );
});

test('the count only ever goes down', () => {
  /* A RATCHET, NOT A TARGET. The standing rule is that `legacy/app.css` goes to zero and
   * every edit moves toward it. This does not require progress — a quiet week is fine —
   * it requires that the file never GROWS, which is the direction that would need arguing
   * for rather than merging.
   *
   * The high-water mark is the measurement in the screen-redesign plan, taken when the
   * work was scoped. Lower it when a cycle lands; never raise it. */
  const HIGH_WATER = 1126; // measured 2026-09-06, SCREEN-REDESIGN-PLAN.md §3
  const actual = declaredClasses(read('../frontend/src/styles/legacy/app.css')).size;
  assert.ok(
    actual <= HIGH_WATER,
    `legacy/app.css declares ${actual} class names, above the ${HIGH_WATER} it was scoped `
      + 'at. This file is supposed to be shrinking to zero — a page needing a new legacy '
      + 'rule is a page that should be taking a component from components/primitives '
      + 'instead.',
  );
});
