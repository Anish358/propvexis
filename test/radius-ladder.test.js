import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* THE RADIUS LADDER, AND NOTHING BESIDE IT.
 *
 * Owner rule, 2026-09-08: "instead of hardcoded radius scale use rhea ladder (preset)."
 * DESIGN-LANGUAGE §6 assigns radius BY SURFACE, and the ladder is 6 / 8 / 10 / 14 / 16 /
 * 24 / 32 plus 99 for pills — every step reachable as a named utility.
 *
 * WHY THIS NEEDED A TEST RATHER THAN A RULE. §6 has said "assignment by surface" since it
 * was written, and about 110 hand-typed radii accumulated against it anyway — a comment
 * beside the values, which is a rule nobody can find. Fifteen were still in the primitives
 * layer this morning, and one of them mattered: five card surfaces typed `rounded-[14px]`
 * instead of reading the token, so `--r-2xl` — documented as "CARDS" — controlled no card
 * at all. Changing the token would have changed nothing on the dashboard. **A token that
 * names a surface must be the only way that surface gets its value**, or the
 * documentation describes something that is not happening.
 *
 * WHAT IS ALLOWED, so the failure message can say it:
 *   · a named utility — `rounded-sm|md|lg|xl|2xl|3xl|4xl|card|full|none`
 *   · a token reference — `rounded-[var(--r-*)]`, for a step with no utility name
 *   · a computed one the registry itself asks for, e.g. `min(--radius-4xl, 24px)`
 *
 * WHAT IS NOT: a number. `rounded-[12px]` is a value nobody can move.
 */

const DIR = fileURLToPath(new URL('../frontend/src/components/primitives/', import.meta.url));

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const files = readdirSync(DIR).filter((f) => /\.jsx?$/.test(f) && f !== 'index.js');

test('no primitive hand-types a radius', () => {
  const offenders = [];
  for (const f of files) {
    const code = stripComments(readFileSync(DIR + f, 'utf8'));
    for (const m of code.matchAll(/rounded(?:-[a-z]{1,2})?-\[(\d+(?:px|rem|%)?)\]/g)) {
      offenders.push(`${f}: ${m[0]}`);
    }
    // the inline form, which the class scan cannot see
    for (const m of code.matchAll(/borderRadius:\s*(\d+)\b/g)) {
      offenders.push(`${f}: style borderRadius: ${m[1]}`);
    }
  }
  assert.deepEqual(
    offenders, [],
    'a radius is hand-typed instead of taken from the ladder:\n  '
      + `${offenders.join('\n  ')}\n\n`
      + 'Use the named utility for the step (rounded-sm/md/lg/xl/2xl/3xl/4xl/card/full),\n'
      + 'or `rounded-[var(--r-*)]` for a step that has no utility name. A typed number is\n'
      + 'a value nobody can move: five card surfaces typed 14px, and the token documented\n'
      + 'as "CARDS" then controlled no card at all.',
  );
});

test('every step of the ladder is reachable by name', () => {
  /* The other half — a rule that says "use the utility" is only fair if the utility
   * exists. `--r-card` was minted on 2026-09-08 for exactly this reason: cards are a
   * SURFACE with a step of their own, and there was no way to say so without typing 24. */
  const bridge = readFileSync(fileURLToPath(new URL('../frontend/src/styles/bridge.css', import.meta.url)), 'utf8');
  for (const step of ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'card', 'input', 'full']) {
    assert.match(
      bridge, new RegExp(`--radius-${step}\\s*:`),
      `--radius-${step} must be declared, or \`rounded-${step}\` is not a utility anyone can use`,
    );
  }
});
