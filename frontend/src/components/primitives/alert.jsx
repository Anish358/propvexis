/* Alert — PropVexis primitive.
 *
 * All four tones render. `info` and `success` used to be INERT — `--info` and
 * `--success` did not exist, so those variants resolved to nothing and rendered an
 * unstyled box, silently. They were missing on purpose: DESIGN-LANGUAGE §4 read
 * "green and red are trade outcomes only. Never status, never chrome", and a green
 * banner in a trading journal reads as profit.
 *
 * §17 (owner ruling, 2026-09-06) narrowed that rather than dropping it. A system
 * message may colour its GLYPH and a 1px EDGE; it may not colour its words or wash
 * its surface; and nothing inside a DATA SURFACE — a table cell, a KPI figure, a
 * chart mark — may use status colour at all. The reason for the reversal is a product
 * one: an error the user does not notice is a worse failure than one they briefly
 * misread.
 *
 * The escalation ladder is deliberate — error is the loudest of the four, so a failed
 * sync does not read like a tip. See §17 for the table.
 *
 * Still true: do not reach for `success` to tint a row, a cell or a figure green.
 * That is the half of §4 the amendment did NOT touch.
 *
 * ── IT STOPPED BEING A BARE RE-EXPORT ON 2026-09-08 ───────────────────────────────────
 *
 * The owner put the four tones side by side on the Test page and said they were "too
 * colorful (doesn't go with our theme)", pointing at shadcn's own alert — where a
 * destructive message sits on the ORDINARY card surface with the ORDINARY border — and
 * asked for "somewhere in middle". Two values move; the construction does not.
 *
 * THIS IS TUNING INSIDE §17, NOT A REVERSAL OF IT, and the distinction matters because
 * §17 is 🔒 LOCKED. The rule says colour may land on the glyph and the edge and nowhere
 * else. It still does. What changed is HOW MUCH, and the numbers are why:
 *
 *     tone edge over our card (#111114)      our loudest NEUTRAL edge is #2d2d31
 *       destructive  32% -> #5d2c2f            20% -> #412225
 *       warning      32% -> #5a3e11            20% -> #3f2d12
 *       info         32% -> #333f5d            20% -> #262e41
 *       success      32% -> #164b2c            20% -> #143523
 *
 * At 32% every tone edge is brighter than any neutral edge the app draws — a chip is
 * #2d2d31 and these were reaching #5d2c2f. At 20% they land at about a chip's WEIGHT
 * while staying unmistakably tinted, which is the "middle" that was asked for.
 *
 * AND THE SURFACE WASH GOES. The generated variants each tint their own background
 * (`bg-<tone>/4`), which is what makes the whole BOX read as coloured rather than a
 * coloured mark on a neutral box — and stacked four-high on a review page it reads as
 * four coloured boxes. §17 set 4% as a CEILING, not a requirement, and shadcn's own
 * destructive alert uses the plain card surface. So every tone now sits on exactly the
 * surface the `default` variant sits on, and the only thing separating them is the glyph
 * and a quiet edge.
 *
 * NOT CHANGED, and deliberately: the glyph keeps the full-strength tone colour. It is the
 * one element carrying the signal, it is 16px, and dimming it would take the message from
 * "quieter" to "harder to notice" — which §17 exists to prevent.
 *
 * WHY A PER-TONE MAP rather than one string. The wash is uniform and could be stated
 * once, but the edge is `border-destructive/32` — the tone is IN the class name, so
 * tailwind-merge can only replace it if the replacement names the same tone. Four lines,
 * each one legible, beats a clever indirection nobody can read the value out of.
 *
 * @design approved 2026-09-08 — owner signed off Batch 3 (Feedback) as a family on
 *   the Test page. Locked WITH the other three: they are the app talking about itself,
 *   and they have to agree. See test/primitives-status.test.js.
 */
import React from 'react';
import { Alert as UIAlert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/* The surface every tone shares — the `default` variant's own, so a message is a neutral
 * box with a coloured mark on it rather than a coloured box. */
const SURFACE = 'bg-transparent dark:bg-input/32';

const EDGE = {
  error: 'border-destructive/20',
  warning: 'border-warning/20',
  info: 'border-info/20',
  success: 'border-success/20',
};

function Alert({ className, variant, ...rest }) {
  return (
    <UIAlert
      variant={variant}
      className={cn(variant && EDGE[variant] ? [SURFACE, EDGE[variant]] : null, className)}
      {...rest}
    />
  );
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
