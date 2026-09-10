/* date-picker.jsx
 *
 * @design approved 2026-09-10 — 🔒 Cycle 00, piece 5. Signed off on the Test page. Asked
 *   for by name ("for this calendar take it from shadcn") because the field was
 *   rendering the BROWSER's picker, which no design language reaches. Its trigger wears
 *   the FIELD surface, not a button's, and copies SelectTrigger's recipe.
 *   A redesigned screen may adopt it. See test/primitives-status.test.js.
 */

import React, { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover.jsx';

/* DatePicker — PropVexis primitive: our calendar in a popover, behind a field-shaped
 * trigger. On the GENERATED `@shadcn/calendar` (base-rhea, installed 2026-09-10).
 *
 * ── WHAT IT REPLACES, AND WHY THE OWNER COULD SEE IT WAS WRONG ───────────────────────
 *
 * `<input type="date">`. The form was rendering the BROWSER'S date picker — Chrome's
 * own calendar, in Chrome's colours, with Chrome's "Clear" and "Today" links and a
 * blue selection. It is the one control on the page that no amount of design language
 * reaches: it is drawn by the browser, outside the page's stylesheet entirely, and it
 * looks different on every OS. Owner, 2026-09-10: "for this calendar take it from
 * shadcn."
 *
 * That makes this the second part of piece 5 that ADDS something rather than restyling
 * it, and for the same underlying reason as the Symbol combobox: the shipped form used
 * a bare HTML input where the product needed a control, and a bare input's affordances
 * are the browser's to decide.
 *
 * ── ⚠ NOT `calendar.jsx`. THAT NAME IS TAKEN, AND BY A LOCKED COMPONENT ──────────────
 *
 * `primitives/calendar.jsx` is the DASHBOARD's month calendar — the P&L heatmap, one of
 * the ten parts approved on 2026-09-06 because they are visible on the locked dashboard.
 * It is a completely different object: a data display of a trading month, not a control
 * for choosing a day. They must never be confused, which is why this file is
 * `date-picker` and why the generated one lands at `ui/calendar.jsx` where nothing
 * shadows it.
 *
 * ── §1 ───────────────────────────────────────────────────────────────────────────────
 *
 *   1. SETTLED PRIMITIVE? No. The dashboard calendar renders a month of results and has
 *      no selection model at all.
 *   2. @shadcn? YES for the calendar — and the owner named it. `date-picker` is NOT a
 *      registry component (404): shadcn documents it as a COMPOSITION of Popover +
 *      Calendar rather than shipping one, which is what this file is. Both halves are
 *      ours already: `popover.jsx` is approved (Batch 1) and the calendar is generated.
 *
 * ⚠ IT COSTS TWO NEW DEPENDENCIES, AND THAT IS WORTH SAYING OUT LOUD. `react-day-picker`
 * and `date-fns` came with it, and this app had NO date library before — every date in
 * it is hand-rolled in `lib/constants.js`. That is a real bundle cost for one control,
 * it was the owner's explicit instruction, and it is recorded here so nobody later finds
 * `date-fns` in package.json and wonders who wanted it.
 *
 * ── THE TRIGGER IS A FIELD, NOT A BUTTON, AND THAT IS THE ONE CORRECTION ─────────────
 *
 * shadcn's own date-picker example uses `Button variant="outline"`. Here that is wrong,
 * and visibly: this control sits in a form grid immediately beside `Result (R)`, which
 * is an `Input`, and one row below `Account`, which is a `SelectTrigger`. A bordered
 * outline button among filled fields reads as an action, not as a value you can change.
 *
 * SO IT WEARS THE FIELD SURFACE, AND THE RECIPE IS COPIED FROM `SelectTrigger` ON
 * PURPOSE — because a Select trigger is exactly this problem already solved: a BUTTON
 * that must look like a FIELD, in this same grid. Reusing the component is not possible
 * (it needs Select's context), so what is shared is the recipe, and a test asserts the
 * two still agree. If `SelectTrigger` is ever re-skinned, that test fails rather than
 * this control quietly becoming the only field in the app with a different fill.
 *
 * `h-8` and `rounded-2xl` are the field metrics — the same ones `Input` declares — and
 * they are stated here rather than inherited because nothing in the cascade would give
 * them to a `<button>`. */
const FIELD_TRIGGER = [
  'flex h-8 w-full items-center justify-between gap-1.5 rounded-2xl',
  'border border-transparent bg-input/50 px-3 py-2 text-sm',
  'transition-[color,box-shadow] duration-200 outline-none',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

/* HOW THE DATE IS WRITTEN. `<input type="date">` showed `09/08/2026` — which is the
 * browser's locale guess and is genuinely ambiguous: the 9th of August or the 8th of
 * September, depending on where the reader is. A trading journal cannot afford that on
 * a close date, and the app already resolves it everywhere else by spelling the month
 * (the Trade Log and the drawer both print `08 Sep`). This follows them.
 *
 * `toLocaleDateString` rather than `date-fns`'s `format`, even though date-fns is now
 * installed: the app formats every other date with the platform, `lib/constants.js` is
 * where that convention lives, and adding a second formatting library to the codebase's
 * vocabulary because a dependency happened to arrive is how two conventions start. */
const fmt = (d) => (d
  ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : null);

function DatePicker({
  value,
  onValueChange,
  placeholder = 'Pick a date',
  disabled = false,
  className,
  ...rest
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={[FIELD_TRIGGER, className].filter(Boolean).join(' ')}
        {...rest}
      >
        <span className={value ? undefined : 'text-muted-foreground'}>
          {fmt(value) ?? placeholder}
        </span>
        {/* Not a chevron. A Select's chevron says "there is a list under this"; a
            calendar glyph says what this actually opens, and it is the one place in the
            form where the two controls would otherwise be indistinguishable. */}
        <CalendarIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>

      {/* `align="start"` overrides the popover's own `end` default: this panel is far
          wider than its trigger, and anchored at the end it hangs left off a field that
          sits in the grid's first column. The calendar paints no surface of its own
          inside a popover — the generated root carries
          `in-data-[slot=popover-content]:bg-transparent` — so it inherits the panel and
          needs no override from us. */}
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => { onValueChange?.(d); setOpen(false); }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker };
