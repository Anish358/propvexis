import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Primitive status — the ratchet behind DESIGN-LANGUAGE §1 step 1.
 *
 * §1 says "stop at the first step that works", and step 1 is an existing primitive.
 * Taken literally, that rule makes every TEMPORARY primitive permanent: reuse it into
 * thirty screens and it can never be replaced. So step 1 is qualified — it only stops
 * on a SETTLED primitive. A provisional one is a redirect to step 2, not an answer.
 *
 * "Provisional" is not a matter of opinion here. It is derived mechanically: a
 * primitive that still APPLIES a legacy `.u-*` class has not been migrated, whatever
 * its header claims. This test asserts the derived set equals the declared set below,
 * so the list cannot grow by accident and cannot shrink without the class going away.
 *
 * TO CLOSE ONE: migrate the component off `.u-*`, delete its `@status provisional`
 * block, delete its entry here, and delete the dead rules from legacy/app.css.
 * All four in the same commit — that last step is the one that gets skipped.
 */

const DIR = fileURLToPath(new URL('../frontend/src/components/primitives/', import.meta.url));

const PROVISIONAL = {
  'empty-state.jsx': 'moved verbatim from ui.jsx; replace with @shadcn empty',
  'loading-block.jsx': 'moved verbatim; rebuild on @shadcn skeleton per §15',
  'tabs.jsx': 'replace with @shadcn tabs',
};

/* Strip comments, so a header that DISCUSSES `.u-card` is not mistaken for one that
 * renders it. button.jsx and card.jsx are why this matters: both explain at length how
 * they differ from the legacy class, and neither applies it. */
function code(src) {
  const stripLineComment = (line) => {
    // Truncate at the first `//` that is not inside a string literal. It has to handle
    // TRAILING comments, not only whole-line ones — card.jsx carries
    // `md: '...',   // 16px - matches .u-card` and is perfectly well migrated.
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      } else if (ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i);
      }
    }
    return line;
  };
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(stripLineComment)
    .join('\n');
}

const files = readdirSync(DIR).filter((f) => /\.(jsx|js)$/.test(f));
const sources = new Map(files.map((f) => [f, readFileSync(DIR + f, 'utf8')]));

test('the provisional set is exactly the set that still renders legacy CSS', () => {
  // A legacy class inside a string literal is application, not discussion.
  const legacy = /['"`][^'"`\n]*\bu-[a-z][a-z0-9-]*/;
  const derived = files.filter((f) => legacy.test(code(sources.get(f)))).sort();
  assert.deepEqual(
    derived,
    Object.keys(PROVISIONAL).sort(),
    'A primitive started or stopped rendering legacy CSS. If you migrated one, remove '
      + 'it from PROVISIONAL and delete its @status block. If you added one, you have '
      + 'introduced a new temporary primitive — which is what §1 step 1 exists to stop.',
  );
});

test('every provisional primitive says so in its own header', () => {
  // The test is the ratchet; the header is what a developer or an agent actually reads
  // before deciding to reuse the thing. Both, or the mechanism does not work.
  for (const f of Object.keys(PROVISIONAL)) {
    assert.match(
      sources.get(f),
      /@status provisional/,
      `${f} is provisional but does not say so where someone would see it`,
    );
  }
});

test('no settled primitive claims to be provisional', () => {
  for (const f of files) {
    if (f in PROVISIONAL) continue;
    assert.doesNotMatch(
      sources.get(f),
      /@status provisional/,
      `${f} declares itself provisional but is not in PROVISIONAL — one of the two is wrong`,
    );
  }
});

test('a provisional primitive stays exported, because call sites must not churn', () => {
  // The replacement keeps the export name. Screens import the name, not the
  // implementation, so migrating one of these touches one file and not thirty.
  const barrel = readFileSync(`${DIR}index.js`, 'utf8');
  const names = {
    'empty-state.jsx': 'EmptyState',
    'loading-block.jsx': 'LoadingBlock',
    'tabs.jsx': 'Tabs',
  };
  for (const [file, name] of Object.entries(names)) {
    assert.ok(file in PROVISIONAL, `${file} should be in PROVISIONAL`);
    assert.match(barrel, new RegExp(`\\b${name}\\b`), `${name} must stay exported from the barrel`);
  }
  /* AND THE ONE THAT GRADUATED. `badge.jsx` was in the map above until 2026-09-07,
     when it moved onto the generated component and its legacy rules were deleted. The
     export assertion is the half that OUTLIVES a migration — the whole promise of this
     seam is that finishing one touches this file and not the thirty screens that import
     the name — so it is kept here rather than deleted with the provisional entry. */
  assert.match(barrel, /Badge/, 'Badge must stay exported after leaving PROVISIONAL');
});

/* ===== The second axis: design sign-off =====
 *
 * The tests above ask "is it still on legacy CSS" — a TECHNICAL question, derivable
 * from source. They are not enough on their own, and menu.jsx is the proof: it is on
 * the generated dropdown, renders no legacy class, passes every check above, and the
 * owner does not like how it looks. It had reached 30 screens before anyone said so.
 *
 * So a primitive carries a second, independent status: has the owner signed off its
 * APPEARANCE. Unlike the first, this one cannot be derived — CI can keep the list
 * complete and in sync, but it cannot detect that someone dislikes something. What it
 * can do is make approval EXPLICIT and DELIBERATE, so a component can never become
 * approved by drifting into wide use.
 *
 * Default is unreviewed. §1 step 1 stops only on a primitive that is BOTH migrated and
 * approved; an unreviewed one may stay in the screens that already use it, but a
 * REDESIGNED screen may not adopt it.
 */

const APPROVED = new Set([
  // Visible on the locked dashboard. The owner signed that page off and
  // DESIGN-LANGUAGE was written from it (ruling 2026-09-06). The line is deliberately
  // "what you could actually SEE on that page" — which is why the overlays are not
  // here. You do not scrutinise a menu that is usually closed.
  'rail.jsx', 'topbar.jsx', 'brief.jsx', 'kpi.jsx', 'account.jsx',
  'panel.jsx', 'calendar.jsx', 'card.jsx', 'button.jsx', 'page-entrance.jsx',

  /* THE FIRST ONE ADDED BY AN ACTUAL REVIEW (2026-09-07), rather than inherited from
   * the dashboard being signed off. Reviewed side by side against preset b2qLMFPP6 on
   * the Test page. It is also the primitive that made this whole mechanism necessary —
   * it had reached 30 screens, second only to wizard.jsx, while nobody had said whether
   * they liked it. This entry is what "the queue drains" looks like. */
  'menu.jsx',

  /* AND THE REST OF BATCH 1, PLUS THREE FROM THE VARIANT MATRIX (owner, 2026-09-07).
   *
   * The overlays were held back from the dashboard inheritance above on the grounds that
   * "you do not scrutinise a menu that is usually closed". They have now been scrutinised
   * — each one beside the registry component with none of our layer applied, which is
   * what the Test page's registry-vs-ours panes exist for — so the reason for holding
   * them no longer applies. `dialog.jsx` is approved as the layer UNDERNEATH `modal.jsx`:
   * every one of the app's modals is a Modal and Modal is built on Dialog, so approving
   * the Modal is approving what Dialog renders. It has no separate appearance to judge.
   *
   * The last three came from the variant matrix, where the owner exercised the states
   * rather than looked at a still: `badge.jsx` on its first render off legacy and on the
   * preset's own custom-colour recipe, `switch.jsx` with its off half rebuilt against the
   * preset's track, and `toggle-group.jsx` which the preset audit deliberately left
   * alone. */
  'modal.jsx', 'popover.jsx', 'dialog.jsx',
  'badge.jsx', 'switch.jsx', 'toggle-group.jsx',
]);

const modules = files.filter((f) => f !== 'index.js');

test('every primitive declares exactly one design-review status', () => {
  for (const f of modules) {
    const tags = sources.get(f).match(/@design (approved|unreviewed)/g) ?? [];
    assert.equal(
      tags.length, 1,
      `${f} declares ${tags.length} @design tags; it must declare exactly one`,
    );
  }
});

test('the approved set is exactly the declared one — approval is never inferred', () => {
  const declared = modules
    .filter((f) => /@design approved/.test(sources.get(f)))
    .sort();
  assert.deepEqual(
    declared, [...APPROVED].sort(),
    'A primitive gained or lost owner approval. Approval is an OWNER decision, not a '
      + 'consequence of a component being widely used or of it passing the legacy-CSS '
      + 'check — menu.jsx passed that check at 30 screens and was still unwanted.',
  );
});

test('an approved primitive carries the date it was approved', () => {
  // "Approved" with no date is a claim nobody can check later.
  for (const f of APPROVED) {
    assert.match(
      sources.get(f), /@design approved \d{4}-\d{2}-\d{2}/,
      `${f} claims approval without saying when`,
    );
  }
});

test('nothing provisional is also approved', () => {
  // Signing off the appearance of something still rendering legacy markup would be
  // signing off the thing that is about to be replaced.
  for (const f of Object.keys(PROVISIONAL)) {
    assert.ok(
      !APPROVED.has(f),
      `${f} is both provisional and approved — it cannot be both`,
    );
  }
});
