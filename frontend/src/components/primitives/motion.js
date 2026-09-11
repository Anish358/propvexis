/* SHARED MOTION — the press treatment, in one place.
 *
 * @design unreviewed — the owner ASKED for this press and specified it ("add it like
 * shadcn", then "extend the treatment"), but has not yet seen it signed off on a review
 * pass. Approval is an owner decision and is never inferred from a request, so this stays
 * `unreviewed` until they say otherwise. It is not a component, so §1's "an unreviewed
 * primitive is a redirect to @shadcn" does not apply — there is nothing here to build
 * with, only two class strings and the rule that governs them.
 *
 * WHY THIS FILE EXISTS. `PRESS` and `PRESS_MOTION` were born inside `account.jsx` when
 * the owner asked for a click animation on the account tabs (2026-09-11). Extending it
 * to the rest of the library put the same two strings in SIX files, and a press
 * treatment copied six times is a press treatment that will disagree with itself within
 * a month — the fix goes where the rule applies, not where the first symptom was.
 *
 * ⚠ THE OTHER MOTION CONSTANTS DELIBERATELY DID NOT MOVE. `HOVER_MOTION`, `STATE_MOTION`,
 * `FILL_MOTION`, `SLIDE_MOTION`, `EXIT_MOTION` and friends stay in the components that
 * own them, because each names a property list specific to what that component animates
 * — a shared `HOVER_MOTION` would be a name meaning "colours, whichever ones you have".
 * The press is different: it is ONE decision about how the whole library answers a
 * click, and it is the same on every surface that takes it.
 *
 * ⚠ THIS IS A `.js` FILE INSIDE THE TAILWIND `@source` DIRECTORY, and that is load-bearing
 * rather than incidental. `tailwind.css` scans `./components/primitives` as a DIRECTORY,
 * so these class strings are only emitted if Tailwind's own extension heuristics pick up
 * `.js`. They do — verified in the BUILT stylesheet, not assumed, because a class that
 * compiles to nothing here would silently un-press the entire library at once. If you
 * ever move this file OUT of `components/{ui,primitives}`, every press in the app dies
 * with no error (§1).
 *
 * ── THE RULE (DESIGN-LANGUAGE §10) ──────────────────────────────────────────────────
 *
 * A press nudge goes on a control the user clicks to ACT — INCLUDING one that opens an
 * overlay. Two things are excluded:
 *
 *   1. ANYTHING A GENERATED COMPONENT ALREADY PRESSES ITS OWN WAY — the rail's rows
 *      press through `ui/sidebar.jsx` (background and weight) and toggles through
 *      `ui/toggle.jsx` (an inset shadow). Adding ours on top would double the treatment.
 *   2. ANYTHING FLUSH WITH ITS NEIGHBOURS — a table row, a segment inside a divided
 *      chip. A control with its own bounds and a gap around it can move without
 *      disturbing anything; one that shares an edge cannot, and 1px there reads as a
 *      broken seam rather than as feedback. The registry's own table presses nothing,
 *      for the same reason.
 *
 * ⚠ A TRIGGER USED TO BE EXCLUDED AND IS NOT ANY MORE (owner, 2026-09-11). The registry
 * writes `active:not-aria-[haspopup]:translate-y-px`, on the reasoning that a trigger
 * bobbing while the surface it opened stays anchored reads as a missed click. That is a
 * real effect, and the owner overruled it after seeing what it costs: the ENTIRE top bar
 * is triggers — Filters and the bell are PopoverTriggers, the account switcher is a
 * MenuTrigger — so the exclusion silently left a whole surface with no click feedback at
 * all. A rule that switches off an entire bar is the wrong rule. `button.jsx` states the
 * unconditional press as a wrapper override; the generated conditional one stays where
 * it is, because we never edit `ui/`.
 *
 * ⚠ SO DID A SEGMENTED CONTROL (same day, same reason it is worth writing down). The
 * Today/Week pills were excluded because a nudge fights the indicator sliding behind
 * them. Pressing the ALREADY-active option — most presses on a segmented control — moves
 * the label against a stationary fill, and the label is what you clicked.
 */

/* THE PRESS: 1px down, the Base Rhea button's idiom.
 *
 * ⚠ "LIKE SHADCN" IS NOT ONE THING. Four generated components in this app press four
 * different ways — the button nudges, the sidebar row shifts background and weight, the
 * tab shifts surface and edge, the toggle flips an inset shadow. The nudge is the one
 * that generalises, because it does not consume a colour channel: several of our
 * surfaces already spend hover on the background (an unselected account tab hovers to
 * the SELECTED surface), so a colour-based press has nowhere left to go that does not
 * read as "already selected".
 *
 * ⚠ NO `not-aria-[haspopup]` MODIFIER, AND ITS ABSENCE IS THE WHOLE POINT NOW. It began
 * as a technicality — our controls are separate components, each statically either a
 * trigger or not, so the conditional could never fire either way. Since 2026-09-11 it is
 * a decision: a trigger presses like anything else, so there is nothing left to
 * condition on. See the trigger note in the rule above. */
export const PRESS = 'active:translate-y-px';

/* THE TRANSITION THAT MAKES IT A PRESS RATHER THAN A JUMP.
 *
 * ⚠ THE PROPERTY IS `translate`, NOT `transform`, AND GETTING IT WRONG FAILS SILENTLY.
 * Tailwind v4 does not build a `transform` matrix for `translate-y-px` — it writes the
 * INDIVIDUAL property, `translate: var(--tw-translate-x) var(--tw-translate-y)`. A
 * transition list naming `transform` therefore matches nothing the utility sets: the
 * control still moves, it just SNAPS down and back with no easing, which reads as a
 * rendering glitch rather than as a press, and nothing errors. This was written as
 * `transform` first and caught by reading the built stylesheet. Tailwind's own
 * `transition-transform` compiles to `transition-property:transform,translate,scale,
 * rotate` — four names precisely because any one of them may be the one in use.
 *
 * (An INLINE `style={{ transform: ... }}` is a real `transform` and does not have this
 * problem — which is why `brief.jsx`'s sliding range pill correctly names `transform`.
 * The trap is specific to Tailwind's utilities.)
 *
 * ⚠ IT REPLACES `HOVER_MOTION`, IT DOES NOT JOIN IT. Both are the `transition-property`
 * utility with the same (empty) modifier set, so tailwind-merge keeps only the LAST and
 * the other's properties vanish with no warning — the merge that already cost this app
 * the top bar pills' hover once. Hence one declaration carrying the colours AND the
 * movement.
 *
 * The list is explicit rather than `transition-all` (what the registry button uses):
 * these four are everything the pressable surfaces animate, and `transition-all` would
 * animate their resize across breakpoints too. `transition-colors` is not a superset —
 * it omits the movement entirely.
 *
 * `--dur-fast`, because §10 splits motion by MEANING: a press acknowledges a pointer, it
 * does not report a change. */
export const PRESS_MOTION = 'transition-[color,background-color,border-color,translate] duration-[var(--dur-fast)] ease-[var(--ease)]';

/* THE LIFT — a hover treatment for a surface you can OPEN, and its press with it.
 *
 * Added 2026-09-11 (owner: "card lift animation on hover", after a first attempt on the
 * calendar's day cells was rejected as broken).
 *
 * ⚠ THE PAIR IS THE POINT, AND THE FIRST ATTEMPT IS WHY. That one set `hover:-translate-
 * y-0.5` and left the standard `PRESS` (`active:translate-y-px`) beside it, so a click on
 * a lifted surface travelled from -2px to +1px — THREE pixels, and past its own resting
 * position. It reads as the thing falling over rather than as a press. Here the press
 * returns it to rest instead: the surface rises under the pointer and settles back when
 * you push it, which is the whole physical metaphor and half the travel.
 *
 * ⚠ IT IS FOR INTERACTIVE SURFACES ONLY, and that is what keeps §14 intact. A lift says
 * "this opens something"; on a static tile it is decoration, and §14's "only interactive
 * elements respond to hover" would forbid it. The calendar gates it on `clickable` — a
 * quiet day still answers the pointer with its edge, but only a day with trades rises.
 *
 * Use it INSTEAD OF `PRESS`, never beside it: both write `--tw-translate-y`, and the one
 * declared later simply wins. Pair it with `PRESS_MOTION` (or a superset) so `translate`
 * is actually transitioned — otherwise the lift snaps. */
export const LIFT = 'transform-gpu hover:-translate-y-0.5 active:translate-y-0';

/* ⚠ `transform-gpu` IS LOAD-BEARING, NOT AN OPTIMISATION. Without it the first version of
 * this shimmered: the owner described "a glitter/cell colour change and back to normal"
 * the instant the pointer landed.
 *
 * The cause is rasterisation, not colour. Mid-transition the cell sits at FRACTIONAL
 * pixel offsets (-0.3px, -1.7px...), and a normally-painted element is re-rasterised at
 * each one — its edges pick up antialiasing and its text switches from subpixel to
 * grayscale AA. On a translucent fill over a dark card that reads as a flicker, and it
 * settles the moment the movement lands on a whole pixel, which is why it looked like a
 * flash that "goes back to normal" rather than a colour that stayed wrong.
 *
 * `transform: translateZ(0)` puts the surface on its own compositor layer AT REST, so the
 * sub-pixel steps are composited rather than repainted and nothing re-rasterises. It has
 * to be on the element ALWAYS, never under `hover:` — promoting at the moment the hover
 * begins causes the very switch it exists to prevent.
 *
 * The surfaces that take LIFT are few (a month has a handful of traded days), so a
 * permanent layer each is cheap. It would not be on a long list. */
