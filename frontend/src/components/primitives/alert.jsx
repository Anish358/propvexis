/* Alert — PropVexis primitive.
 *
 * A bare re-export, and it is worth saying why it stayed one.
 *
 * All four tones now render. `info` and `success` used to be INERT — `--info` and
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
 * The generated component already spends colour in exactly those two places:
 *
 *     error: "border-destructive/32 bg-destructive/4 [&>svg]:text-destructive"
 *
 * border and glyph coloured, `text-card-foreground` inherited from the base, and the
 * surface at 4% — a trace, which §17 sets as the ceiling. So this file has nothing to
 * override, and per §1's build order that is the outcome to prefer. The two tokens it
 * was missing are aliases (`--success` → `--profit`, `--info` → `--status-info`) in
 * tokens.css, mapped in bridge.css. No new hue, no new preset ID.
 *
 * The escalation ladder is deliberate — error is the loudest of the four, so a failed
 * sync does not read like a tip. See §17 for the table.
 *
 * Still true: do not reach for `success` to tint a row, a cell or a figure green.
 * That is the half of §4 the amendment did NOT touch.
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */
export { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
