import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* LEGACY/APP.CSS IS FROZEN. IT MAY ONLY SHRINK.
 *
 * Owner rule, 2026-09-08: "hereafter whenever something new is happening I always want you
 * to use shadcn/Tailwind and NEVER legacy. I don't want anything new added to legacy
 * anywhere." They asked whether that was even possible before asking for it as a rule.
 *
 * It is, and it should be a TEST rather than a rule, because a rule is something a person
 * has to remember at the moment they are busy solving a different problem. CLAUDE.md has
 * carried "NEVER PATCH LEGACY CSS" in capitals since 2026-09-07 and it was still worth
 * writing down again — which is the argument for enforcing it mechanically instead.
 *
 * WHAT IS FROZEN, AND WHY IT IS THE CLASS NAMES RATHER THAN THE FILE SIZE. Bytes and lines
 * both grow when a COMMENT is added, and this session added several — notes recording what
 * was deleted and why, which are the most valuable lines in that file. A ratchet that
 * punishes documentation would be quietly harmful. Declared class names do not move when
 * prose does, so that is what is pinned.
 *
 * WHAT THIS CANNOT STOP, stated plainly so nobody trusts it further than it goes:
 *
 *   · Adding a declaration to an EXISTING legacy rule. §1's standing rule already forbids
 *     that ("the fix is never to edit that rule"), and no test can tell a bug fix from a
 *     new feature inside a `{ }` that is already there. What this does guarantee is that
 *     the SURFACE cannot grow: no new component, page or state can be expressed in that
 *     file, because it cannot have a name.
 *   · Inline `style={{ }}` in a page. That is not legacy CSS and has its own rules.
 *
 * WHAT IT DOES GUARANTEE is the thing that was actually asked for: nothing NEW gets built
 * on the old stylesheet, anywhere, ever again. A new screen has to reach for
 * `components/primitives`, because the alternative will not compile past CI.
 */

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/* Comments stripped: app.css DISCUSSES names it no longer declares — deliberately, since
 * several of those notes exist to record what was removed. Counting prose would make the
 * frozen set grow every time the file is documented, which is the opposite of the point. */
function declaredClasses(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return new Set([...code.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
}

const frozen = new Set(
  read('./fixtures/legacy-classes.txt')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
);

test('legacy/app.css declares no class name that was not already there', () => {
  const actual = declaredClasses(read('../frontend/src/styles/legacy/app.css'));
  const added = [...actual].filter((c) => !frozen.has(c)).sort();

  assert.deepEqual(
    added, [],
    `legacy/app.css has grown a new class name: ${added.join(', ')}.\n\n`
      + 'That file is frozen (owner, 2026-09-08) and may only shrink — every screen still\n'
      + 'on it is scheduled for redesign, and anything added today is work that gets\n'
      + 'deleted twice. Build it with the primitives instead:\n\n'
      + '    import { Button, Card, Field, Input } from "@/components/primitives";\n\n'
      + 'A Tailwind utility works there and compiles to nothing in a page, which is why\n'
      + 'the appearance belongs in a component rather than at the call site.\n\n'
      + 'If a name is genuinely being RENAMED rather than added (as `.grid` became\n'
      + '`.log-grid`), update test/fixtures/legacy-classes.txt in the same commit.',
  );
});

test('the frozen list contains nothing the stylesheet has already dropped', () => {
  /* THE OTHER DIRECTION, and it is what keeps the list honest rather than decorative.
   * Without it the fixture would slowly fill with names of rules deleted months ago, and
   * "969 frozen" would stop meaning "969 live". Deleting a screen's CSS is supposed to
   * show up as a diff in this file — that diff IS the progress record, and it only works
   * if the list is kept exact. */
  const actual = declaredClasses(read('../frontend/src/styles/legacy/app.css'));
  const stale = [...frozen].filter((c) => !actual.has(c)).sort();

  assert.deepEqual(
    stale, [],
    `test/fixtures/legacy-classes.txt still lists ${stale.length} class name(s) that `
      + `legacy/app.css no longer declares: ${stale.slice(0, 12).join(', ')}`
      + `${stale.length > 12 ? ' …' : ''}.\n\n`
      + 'Good news — something was deleted. Remove those names from the fixture in the same\n'
      + 'commit, so the list keeps meaning "what is left" rather than "what once was".',
  );
});

test('no new stylesheet can be slipped in beside the frozen one', () => {
  /* Freezing one file achieves nothing if the next page ships `styles/new-page.css`. The
   * import list in index.css is the whole cascade, in order, and it is four entries by
   * design — the file's own header explains why each exists and why legacy is last. A
   * fifth is a decision, not an accident, so it should fail here and be argued for. */
  const index = read('../frontend/src/styles/index.css');
  const imports = [...index.matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    imports,
    ['../tailwind.css', './tokens.css', './bridge.css', './scrollbars.css', './legacy/app.css'],
    'the stylesheet set changed. Appearance belongs in components/{ui,primitives}, where '
      + 'Tailwind compiles; a new .css file is a fifth cascade layer nobody has reasoned '
      + 'about. If this is deliberate, say why in index.css and update this list.',
  );
});
