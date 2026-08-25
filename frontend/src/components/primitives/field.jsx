/* Field — PropVexis primitive.
 *
 * A straight re-export today, per index.js's rule: a module earns a wrapper when it
 * has a reason, and the label/description/item composition needs no PropVexis
 * difference. What it buys over a hand-rolled <label>+<input> is the aria wiring —
 * Base UI's Field links the label, the description and the control's
 * aria-describedby, which is the part that gets forgotten by hand.
 *
 * TWO THINGS RECORDED FOR WHOEVER REACHES FOR THIS NEXT, both found while adding it:
 *
 * 1. `FieldError` IS WRONG AS SHIPPED and nothing uses it yet. It renders
 *    `text-destructive-foreground`, and bridge.css maps that to `--on-accent` — a
 *    near-white colour whose job is text sitting ON a destructive FILL. As error text
 *    on the page background it is just white text and does not read as an error at
 *    all. The obvious correction is `text-destructive` (= `--loss`), and it is
 *    deliberately NOT made here: DESIGN-LANGUAGE §17 is ⬜ OPEN on exactly this
 *    question — "the library has one destructive slot, meaning a failed action. A
 *    losing trade is not a destructive action... bridge.css currently maps
 *    destructive → --loss only because there is no other slot. Revisit; do not build
 *    on it." Correcting it here would settle an open rule in a side street, which
 *    §18 warns against by name. The first page that genuinely needs inline validation
 *    copy is the one that should force the decision.
 *
 * 2. `shadcn add @coss/field` WRITES TO tailwind.css. It appended a
 *    `--destructive-foreground` pair built from Tailwind's raw palette
 *    (`var(--color-red-700)` / `var(--color-red-400)`) plus a `.dark` block —
 *    duplicating what bridge.css already maps and breaking §4's "no raw colour
 *    anywhere" and §4's dark-is-default-via-data-theme. Reverted. token-bridge.test.js
 *    catches both halves now; it caught only the `.dark` one before.
 */
export {
  Field, FieldDescription, FieldError, FieldItem, FieldLabel,
} from '@/components/ui/field';
