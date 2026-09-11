/* combobox.jsx
 *
 * @design approved 2026-09-10 — 🔒 Cycle 00, piece 5. Signed off on the Test page with
 *   two rulings: the list is OPEN (which is WIRING, not a flag — see below) and it
 *   offers the clean symbol, not the broker's. Only the Symbol field takes one; a
 *   Select becomes a Combobox when the list outgrows the EYE.
 *   A redesigned screen may adopt it. See test/primitives-status.test.js.
 */

import React from 'react';
import {
  Combobox as UiCombobox, ComboboxContent as UiComboboxContent,
  ComboboxEmpty as UiComboboxEmpty, ComboboxGroup as UiComboboxGroup,
  ComboboxInput as UiComboboxInput, ComboboxItem as UiComboboxItem,
  ComboboxLabel as UiComboboxLabel, ComboboxList as UiComboboxList,
  ComboboxTrigger as UiComboboxTrigger, ComboboxValue as UiComboboxValue,
} from '@/components/ui/combobox';

/* Combobox — PropVexis primitive, on the GENERATED `@shadcn/combobox` (base-rhea,
 * installed 2026-09-10). A SELECT YOU CAN TYPE INTO: the list filters as you type.
 *
 * ── WHY IT EXISTS, AND WHY ONLY ONE FIELD GETS IT (owner, 2026-09-10) ────────────────
 *
 * Asked for on the form-section specimen: "dropdown should be there for symbol with
 * search as well… with type i mean". Symbol is the right field and it is the ONLY one on
 * that form that is right. A trader's instrument list is hundreds long — every FX pair,
 * index, metal and crypto their broker lists, each with a broker-specific suffix
 * (`XAUUSD.pro`) — and it is the one field where you already know the answer and just
 * need to say it. Typing four characters beats scrolling a list you cannot see the end
 * of, and beats a free-text input that accepts `EURSUD` silently.
 *
 * SESSION, DIRECTION AND STRATEGY STAY ON `Select`. Three, two and a handful of options
 * respectively — a search box over three items is furniture, and §2 is explicit that a
 * control the product does not need is not built because a neighbouring one has it. The
 * rule this draws is worth stating once: **a Select becomes a Combobox when the list
 * outgrows the eye, not when it outgrows the developer.**
 *
 * WHAT IT REPLACES on that form is not a Select at all — Symbol ships today as
 * `<input placeholder="EURUSD">`, free text, no validation.
 *
 * ── ⚠ RULED OPEN (owner, 2026-09-10) — AND "OPEN" IS WIRING, NOT A FLAG ─────────────
 *
 * The list SUGGESTS instruments and still accepts one you type. That was ruled after
 * being told the control was already open, which was WRONG and is worth the correction
 * here because the mistake is easy to repeat: Base UI keeps the SELECTED item (`value`)
 * and the TYPED text (`inputValue`) apart, and text matching nothing selects nothing. A
 * combobox left alone is therefore effectively a CLOSED list — it just never says so,
 * because the control looks identical either way and the typed text simply evaporates
 * on submit.
 *
 * Open costs two bindings, both to one string: `value`/`onValueChange` for the pick,
 * `inputValue`/`onInputValueChange` for the typing. Whatever is in the box when you
 * submit is the answer. **Every migrated form that wants an open list must do this**,
 * and the empty state must SAY the list is open — a bare "No matches" reads as a dead
 * end, which is the other half of why a closed one passes for open.
 *
 * ── AND THE VALUES ARE THE CLEAN SYMBOLS (owner, 2026-09-10) ────────────────────────
 *
 * `XAUUSD`, not `XAUUSD.pro`. The app stores both — `symbol_base` is what a trader reads
 * and `symbol` is what MT5 sends — and the clean one is what the Trade Log column, the
 * drawer heading and every analytics grouping already use. Offering the broker string
 * would make gold on two prop firms two different instruments and split its stats. The
 * broker's own string is still stored and still shown; the drawer has a "Broker Symbol"
 * row for exactly that.
 *
 * ── §1, AND STEP 2 ANSWERED IT CLEANLY FOR ONCE ──────────────────────────────────────
 *
 *   1. SETTLED PRIMITIVE? No. `Select` (Batch 2, approved) has no text entry, and
 *      `Command` (piece 3, approved) is a searchable LIST but not a form control — it
 *      has no trigger, no value, and nothing to submit. The two halves existed and the
 *      thing that joins them did not.
 *   2. @shadcn? YES — and unlike `field`, this one is on the RIGHT primitive. The
 *      registry's base-rhea combobox is `Combobox` from `@base-ui/react`, the same
 *      library as our Select, Field and Fieldset. Stop here; @coss not reached.
 *
 * ⚠ TWO THINGS ABOUT THE INSTALL, BOTH WORTH THE LINES.
 *
 * `--overwrite` WAS NOT PASSED, AND THE CLI ASKED ANYWAY. It prompts per existing file,
 * and the registry lists `button` and `input-group` as dependencies of this component —
 * so a bare `--yes` stops dead on "The file button.tsx already exists", and answering
 * wrong re-runs the 09-09 clobber that rewrote four LOCKED components. Every prompt was
 * answered N; the CLI reported `Skipped 4 files: button, input, textarea, input-group`,
 * which is the correct outcome and worth checking for by name next time.
 *
 * THE JUNK `cn` PACKAGE CAME BACK. The registry source says `import { cn } from "cn"`
 * and the CLI does not rewrite it, so `npm i` added `cn@0.2.6` — the third occurrence of
 * finding #1 from the data table. Recovery is the recorded one: repoint the import to
 * `@/lib/utils`, `npm uninstall cn`, touch nothing else (a blanket sed over
 * `components/ui/*` rewrites line endings on every file it passes). `ui-primitives.test.js`
 * is the ratchet that makes this findable rather than shipped.
 *
 * (`cmdk` in package.json is NOT junk and must stay — `ui/command.jsx` genuinely needs
 * it. It has been uncommitted since piece 3 installed it on 09-09.)
 *
 * ── WHAT THE WRAPPER ADDS: ONE ATTRIBUTE AND ONE UTILITY ─────────────────────────────
 *
 * The same answer piece 3's Command gave, for the same reason: `menu.jsx` settled this
 * vocabulary on 09-07 and the registry agrees with it. `ComboboxItem` already asks for
 * `rounded-xl` (14px, the menu row), `text-sm` (14px through our bridge) and
 * `data-highlighted:bg-accent`, and `ComboboxContent` already asks for `bg-popover`.
 * Nothing to correct.
 *
 * `data-overlay-surface` — the EIGHTH instance. Without it every row inside this popup
 * hovers to a CARD's hover while sitting on a panel, and the edge goes the same way.
 * `--color-accent` and `--color-border` are both contextual; the attribute is the whole
 * fix and `generated-resets.test.js` derives the set that needs it.
 *
 * `overlay-motion` — §10. The registry hardcodes `duration-100`, which is on nobody's
 * ladder (`--dur-fast` is 120ms). Unlike the SHEET, this popup animates with the
 * `animate-in`/`animate-out` KEYFRAME classes, so `overlay-motion` actually reaches it —
 * that utility only ever drives `--tw-animation-duration`. Same seam as menu, popover,
 * select and tooltip; the drawer is the one overlay it does not fit, and its file says so.
 */

const MOTION = 'overlay-motion';

function ComboboxContent({ className, ...rest }) {
  return (
    <UiComboboxContent
      data-overlay-surface=""
      className={[MOTION, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

/* EVERYTHING ELSE IS A STRAIGHT RE-EXPORT, per index.js's rule that a module earns a
 * wrapper when it has a reason. The trigger, the input, the list, the item, the group
 * label and the empty state all arrive correct — the empty state included, which is
 * worth noting because `FilterPanel` hand-rolls its own "No matches" today and this is
 * the second registry component in two pieces to ship one we were writing by hand. */
export {
  ComboboxContent,
  UiCombobox as Combobox,
  UiComboboxEmpty as ComboboxEmpty,
  UiComboboxGroup as ComboboxGroup,
  UiComboboxInput as ComboboxInput,
  UiComboboxItem as ComboboxItem,
  UiComboboxLabel as ComboboxLabel,
  UiComboboxList as ComboboxList,
  UiComboboxTrigger as ComboboxTrigger,
  UiComboboxValue as ComboboxValue,
};
