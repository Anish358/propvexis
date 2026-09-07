/* button.jsx
 *
 * @design approved 2026-09-06 — visible on the locked dashboard (every button on that page).
 *   The owner signed that page off and DESIGN-LANGUAGE was written from it.
 */

import React from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* Button — PropVexis primitive.
 *
 * THIS WRAPPER EXISTS TO KEEP THE APP'S EXISTING PROP VOCABULARY. The app has had
 * a primitive layer since Phase 1 (`ui.jsx` over the `.u-*` classes) and eight
 * pages are written against its API: variant="primary|secondary|ghost|danger",
 * size="sm|md|lg", block, as. shadcn's Button speaks a different dialect —
 * variant="default|outline|…", size="xs|sm|default|lg|icon…", and Base UI's
 * `render` in place of `as`.
 *
 * Translating here rather than at every call site is the entire point of this
 * layer: a page migrates by changing ONE import line and no JSX moves. It also
 * lets the two layers coexist during the migration — a page still on ui.jsx and a
 * page on primitives read identically in source.
 *
 * WHAT CHANGES VISUALLY: geometry and states now come from the approved preset
 * (radius, height, type size, hover behaviour) instead of from `.u-btn` in legacy
 * CSS. Colours were already shared — both resolve the same tokens through the
 * bridge. That difference is the point of the migration, not a regression.
 *
 * IT RENDERS THE BASE UI BUTTON DIRECTLY, NOT `ui/button.jsx`, AS OF PHASE 4c — and
 * this is the ref limitation `index.js` documented coming due rather than a change of
 * mind. The generated wrapper is a plain function component written against React 19,
 * where `ref` is an ordinary prop; on React 18.3 it is not, so a ref handed to it is
 * dropped with a warning. That cost nothing while every Button was a leaf.
 *
 * Phase 4c made four of them OVERLAY TRIGGERS — `<MenuTrigger render={<Button/>} />`,
 * same for the popovers. A trigger's ref is not decoration: Base UI measures that
 * element to place the popup and focuses it again on close. Dropped, the menu would
 * anchor to nothing and focus would land on <body>.
 *
 * So this follows the fix `index.js` prescribes for exactly this case — render the Base
 * UI primitive (a real `forwardRef`) and reuse the generated `buttonVariants`, rather
 * than hand-edit generated code that the next `shadcn add` would overwrite. The skin is
 * still 100% the preset's: `buttonVariants` IS the generated cva. Only the ref path
 * changed, and `data-slot="button"` is preserved because it is the component's public
 * hook — legacy geometry rules in app.css select on it.
 */

// Our vocabulary -> the library's. `secondary` maps to `outline`, not to shadcn's
// `secondary`, because `.u-btn--secondary` is a bordered surface (--surface-2 +
// --line) which is what `outline` draws; shadcn's `secondary` is a filled tint
// with no border.
const VARIANTS = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
  // `tinted` is one of two words this vocabulary gained rather than translated, added
  // for the top bar's account switcher (Phase 4c) and now also worn by Sync Trades —
  // it is the FILLED QUIET BUTTON the design uses for both, and tokens.css names them
  // together on --control-bg-strong. It is a FILLED neutral surface
  // with no border — shadcn's own `secondary` — and none of the four above can be
  // it: `secondary` here means `outline`, whose dark-mode rule is
  // `dark:bg-transparent`, and this app is dark-first, so a control that must read
  // as "holds the current scope" would have come out indistinguishable from the
  // ghost buttons beside it. Named for what it draws, because the obvious name was
  // already spent on a different shape.
  tinted: 'secondary',
  // `chrome` is the other, and it is a component this app already had four copies of
  // without ever naming. Phase 4c deleted `.tb-btn`, `.tb-icon-btn`, `.tb-icon` and
  // `.notif-inline .notif-bell` from legacy CSS, and all four declared the SAME
  // control: transparent, resting at `--text-2`, hover filling to `--surface-hover`
  // and brightening to `--text`, radius `--r-md`. Four rules agreeing by hand is the
  // evidence that this is one thing, so it is one thing here.
  //
  // It is `ghost` plus a resting colour, which shadcn's ghost has none of — it
  // inherits, and inheriting is right for a ghost button inside content. A control in
  // app CHROME is quieter than the content around it until you touch it, which is the
  // whole distinction the name carries.
  chrome: 'ghost',
};

/* The chrome variant's own layer, applied after RADIUS so tailwind-merge lets
 * `rounded-md` replace it: DESIGN-LANGUAGE §5 files "smaller chrome — icon buttons,
 * menu rows" under `--r-sm`/`--r-md`, a step below the button radius.
 *
 * The hover half is §13 "hover intensifies what's already there" read literally: this
 * control has no border, so the surface fills rather than an edge brightening. Both
 * halves come from the deleted legacy rules verbatim — the token names changed, the
 * values did not. */
const CHROME = 'rounded-md hover:bg-muted';
const CHROME_REST = 'text-muted-foreground hover:text-foreground';

const SIZES = { sm: 'sm', md: 'default', lg: 'lg' };

/* RADIUS — THE OVERRIDE IS GONE (§6 amended 2026-09-07, owner).
 *
 * This wrapper forced `rounded-lg` (10px) over the generated `rounded-2xl`, because §6
 * assigned buttons `--r-lg`. The owner amended §6 to match the preset everywhere, so the
 * button now takes what the generated component asks for and this correction is deleted
 * rather than re-valued — one fewer place where our layer silently re-means shadcn.
 *
 * `--radius-2xl` is 16px in bridge.css now, decoupled from `--r-2xl` (14px, the CARD
 * radius). It had been pointed there, which under-rounded every control by two pixels
 * before this override then took it to 10.
 *
 * WHAT THIS COST TO FIND: the numbers in this comment read "~13px" and "~7px" for two
 * months after the Rhea re-valuation moved them to 14 and 10, and that drift is what
 * made the scale look further from the preset than it was. A comment is the one part of
 * a file no test reads.
 */

/* THE OUTLINE EDGE — a control's, not a card's, AND CONTEXTUAL (2026-09-07, revised the
 * same day).
 *
 * The generated `outline` variant draws `border-border`, which `bridge.css` maps to
 * `--chrome-line` — A CARD'S EDGE (#1b1b1e) at `:root`. §4's border ramp is explicit
 * that a pill control takes a louder step instead, and the two exist precisely because a
 * control has to read against surfaces a card never sits on. So this override stays: a
 * bare `border-border` would put a card's edge on a control.
 *
 * WHAT IT WAS, AND WHY THAT WAS ONLY HALF A FIX. This read `border-[var(--line-control)]`
 * — a FIXED #252528 — to stop an outline button inside a dialog or a menu drawing a
 * #1b1b1e edge on an #18181b panel (three units; Cancel buttons looked like plain text).
 * It worked, and it was written the same day as the `[data-overlay-surface]` rule, which
 * fixes the same bug properly. Two fixes for one bug, and the fixed one won, because a
 * literal beats a contextual token by simply not asking.
 *
 * The cost showed up beside the preset's own dialog: `--line-control` is tuned to a CARD
 * (+20 over #111114) exactly the way `--line` is, so on a panel it is +13 — QUIETER than
 * the panel's own `--overlay-line` edge (#2f2f33). The Cancel button receded into the
 * modal containing it, which is the reverse of the ramp this override exists to honour.
 *
 * `--chrome-line-control` is the same token pattern as `--chrome-line` and
 * `--chrome-hover`: it names the job and the surface underneath supplies the value —
 * `--line-control` on a card, `--line-chip` (#2d2d31, +21) on a panel, so the control
 * keeps the contrast it was tuned for wherever it lands.
 *
 * SEVENTH instance of one token asked to serve a card and an overlay at once, after the
 * panel, the row highlight, the panel edge, the submenu ring, the modal surface and the
 * outline button's HOVER — which was fixed contextually while its BORDER, one property
 * away, was fixed literally. See §25, and tokens.css "CHROME IS CONTEXTUAL". */
const OUTLINE_EDGE = 'border-[var(--chrome-line-control)]';

/* THE OPEN STATE IS THE PRESET'S, ONE VARIANT AT A TIME (owner, 2026-09-07 — reversing a
 * ruling made earlier the same day).
 *
 * What stood here was OPEN_HOVER:
 *
 *     const OPEN_HOVER = 'dark:aria-[expanded=true]:hover:bg-[var(--sel-bg)]';
 *
 * added to EVERY variant, so an open trigger held --sel-bg instead of dimming under the
 * cursor. The §14 reading behind it was sound and is still true: the generated variants
 * carry both `aria-expanded:bg-muted` and `dark:hover:bg-input/30`, Tailwind sorts the
 * compound `dark:hover:` AFTER the plain `aria-expanded:`, so hovering an OPEN outline
 * trigger really does make it quieter and the open state only arrives once the cursor
 * leaves. The preset has the same quirk. We were deliberately stricter than it.
 *
 * TWO THINGS DECIDED AGAINST KEEPING IT.
 *
 * It was unconditional, and only two variants have an open state at all. `default` and
 * `destructive` carry no `aria-expanded:` rule in the preset, so this line was the ONLY
 * open styling they had — and it painted a primary CTA and a destructive button
 * --sel-bg, a neutral grey, for as long as the cursor sat on one with its menu open. A
 * blue button going grey on hover was never the intent; it is what applying the fix
 * everywhere bought, and no specimen on the review page opens a menu from a primary
 * button, so nothing showed it.
 *
 * And the owner chose preset parity per variant over our stricter reading, with the
 * trade stated. So the open state is now exactly what each variant asks for:
 *
 *     default / destructive / link    no rule                     open reads as REST
 *     secondary (shadcn's own)        aria-expanded:bg-secondary   its own REST fill
 *     outline / ghost                 aria-expanded:bg-muted       holds a fill
 *
 * WHAT IT COSTS, so this is not rediscovered later as a bug: on `outline` and `ghost` —
 * which is what our `secondary` maps to, and so what every menu trigger in this app
 * wears — hovering an OPEN trigger still reduces it to the `input/30` wash, and moving
 * the cursor off onto the menu BRIGHTENS it to --muted. §14 says hover intensifies what
 * is already there; here it does not. That is the preset's behaviour, adopted knowingly.
 *
 * THE PILL FOLLOWS TOO (same ruling). Its `aria-expanded:hover:` hold is gone as well,
 * so the top bar's capsule dims under the pointer exactly as `ghost` does — the owner
 * asked for parity even on the shapes the preset does not ship. `topbar-overlays.test.js`
 * pins the new direction and records the old one. */

/* `pill` — the top bar's shape, added 2026-08-28 with the Figma redesign.
 *
 * The frame draws every control in the bar fully rounded: the account switcher, the
 * unit toggle's container, the notification bell and the avatar. That is a statement
 * about the BAR, not about buttons — chrome that floats above the page is a capsule,
 * content actions are rects — so it is a boolean any variant can take rather than a
 * fifth variant, and the same reasoning as `active` above: it is orthogonal.
 *
 * It sits after RADIUS in the class list so tailwind-merge lets it replace both the
 * generated `rounded-2xl` and the corrected `rounded-lg` — one radius on the element,
 * never two racing on specificity. */
/* AND ONE HEIGHT WITH IT. The bar's controls were three sizes — `sm` for the switcher,
 * `icon-sm` for the glyphs, a padded container for the toggle — which is invisible in
 * isolation and obvious in a row. `pill` carries the height because in this app the
 * capsule IS the bar: nothing else uses it, and a shape that only appears in one place
 * may as well bring that place's metrics. `w-9` only for the icon sizes, so a labelled
 * pill still sizes to its text. */
/* AND THE BAR'S SURFACE WITH IT (2026-08-29, Rhea). Every control in Rhea's bar rests
 * on --control-bg behind --line-control and hovers to --surface-hover — the Filters
 * button, the two icon buttons and the toggle's track are one family, drawn once.
 * Carried by `pill` for the same reason the height is: nothing outside the bar uses
 * this shape, so the shape may as well bring the place's colours.
 *
 * `tinted` opts out below. The account switcher is deliberately a step brighter than
 * its neighbours, because it is the one control that changes what every figure on the
 * page MEANS rather than how it is written or which rows feed it.
 *
 * A STEP, NOT THREE (2026-08-30). `tinted` took its surface from the generated
 * `secondary` variant, which resolves to --secondary = --sel-bg (#1c1c21) and hovers by
 * mixing 5% of the foreground into it (~#232327). The design draws this control at
 * #141418 resting and #1b1b20 hovered — one step above the Filters button beside it,
 * not three, and the hover a step above that rather than a jump into chip territory.
 * --control-bg-strong is literally "a FILLED quiet button" and --surface-hover is "any
 * control's hover"; both land within two hex steps of the design, which is why this is
 * a re-point rather than two new tokens (§21 would make that an owner-approval change
 * for a difference nobody can see). */
const TINTED = [
  // --line-strong IS #26262b, the design's own border for this control, and the same
  // hairline `.acct-switch-sub` already draws between the scope and its phases — so the
  // button's edge and the rule inside it are one colour rather than two that nearly
  // match.
  'border border-[var(--line-strong)] bg-[var(--control-bg-strong)] text-[var(--text)]',
  // 550, not the preset's 500: this is the one control in the bar whose label is a
  // value rather than a name, and the design sets it a half-step up from its neighbours.
  'text-[13.5px] font-[550]',
  /* gap-2.5 (10px), against the `sm` size's gap-1 (4px). The switcher holds three
     things — a health dot, the scope label, and the phase summary behind its own rule —
     and at 4px they ran together into one string ("2 Accounts P1"). The design gives
     this button 10px, and the phase summary then adds its own 9px after the rule, which
     is what makes the two halves read as two facts. Sync Trades wears the same class
     and the design gives it 8; 2px looser on an icon-and-label pair is invisible, where
     6px tighter on the switcher was the defect. */
  'gap-2.5',
  'hover:bg-[var(--surface-hover)]',
].join(' ');

/* THE HOVER HAD TO BE SAID THREE TIMES, AND EACH ONE IS LOAD-BEARING (2026-09-02).
 *
 * The bar's two chrome pills — Filters and the bell — are `chrome` + `pill`, and
 * `chrome` maps to the generated `ghost`, whose own class string carries
 * `dark:hover:bg-muted/50` and `aria-expanded:bg-muted` alongside the plain
 * `hover:bg-muted` this list replaces. tailwind-merge only drops a class when the
 * MODIFIER SETS match, so `hover:` deletes `hover:` and leaves the other two standing —
 * and both then beat this line in the cascade: `dark:hover:` is emitted later inside the
 * same `@media (hover:hover)` block, and `aria-expanded:` outranks nothing but applies
 * when nothing else does.
 *
 * WHAT THAT LOOKED LIKE, measured in the built CSS rather than reasoned about: hovering
 * either control resolved to `color-mix(in oklab, var(--sel-bg) 50%, transparent)` — a
 * HALF-TRANSPARENT fill, so it composited against the translucent top bar behind it and
 * landed within a hex step of --control-bg. The pill's hover was invisible; only the
 * label brightened. The design draws #1a1a1e against #131316, which is --surface-hover
 * against --control-bg — the tokens were already right and never reached the element.
 *
 * So each stray class is answered in its own modifier set, where tailwind-merge can
 * actually delete it, instead of a fourth rule racing it on source order:
 *   hover:              the design's own step
 *   dark:hover:         the same, because `dark` is `&` here (bridge §THEMING) and the
 *                       generated dark hover is a mix this app never wanted
 *   aria-expanded:      one step further to --sel-bg while the popover is open, so the
 *                       control says it owns the panel hanging off it.
 *   aria-expanded:hover: GONE (owner, 2026-09-07). It held that step so an open pill
 *                       would not dim under the pointer — §14 — and it was the last
 *                       place we were stricter than the preset on the open state.
 *                       The owner asked for preset parity everywhere, including the
 *                       shapes the preset does not itself ship, so hovering an open
 *                       pill now falls to --surface-hover the way the generated
 *                       `ghost` falls to its own hover. ONE LINE TO PUT BACK if the
 *                       §14 reading wins again; `topbar-overlays.test.js` states
 *                       which way it is pinned and why.
 *                       pointer — hover would take it back down to --surface-hover,
 *                       which is §14 backwards. It wins on specificity (class + attr +
 *                       pseudo-class), not on order. */
const PILL = [
  'h-9 rounded-full border border-[var(--line-control)] bg-[var(--control-bg)]',
  'text-[13.5px] font-medium text-[var(--text-2)]',
  'hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
  'dark:hover:bg-[var(--surface-hover)]',
  'aria-expanded:bg-[var(--sel-bg)]',
].join(' ');
const PILL_ICON = 'w-9';

const Button = React.forwardRef(function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  // `active` is meaningful for `chrome` only, and it means "this control's state is
  // engaged" — the Filters button once any filter is set. It drops the muted resting
  // colour so the label sits at full strength, which is exactly what `.tb-btn.active`
  // did. A boolean rather than a second variant because it is orthogonal: any chrome
  // control can be engaged or not.
  active = false,
  // See PILL above: the top bar's controls are capsules, content actions are not.
  pill = false,
  as: As,
  className,
  ...rest
}, ref) {
  const isChrome = variant === 'chrome';
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      // `cn()` is tailwind-merge, so every override below REPLACES the generated class
      // it conflicts with instead of racing it on specificity. That is what makes the
      // RADIUS correction and the chrome layer safe to state as utilities.
      className={cn(
        buttonVariants({ variant: VARIANTS[variant] ?? variant, size: SIZES[size] ?? size }),
        (VARIANTS[variant] ?? variant) === 'outline' && OUTLINE_EDGE,
        isChrome && CHROME,
        // An engaged control keeps the hover but not the muted rest, so the two states
        // stay distinguishable — hence only the resting half is conditional.
        isChrome && (active ? 'text-foreground' : CHROME_REST),
        // `tinted` keeps the pill's SHAPE and brings its own surface — see TINTED above.
        pill && (variant === 'tinted' ? `h-9 rounded-full ${TINTED}` : PILL),
        pill && String(size).startsWith('icon') && PILL_ICON,
        block && 'w-full',
        className,
      )}
      // ui.jsx's `as` renders a different element (a, Link) while keeping styles.
      // Base UI does that job with `render`, which merges props into the element
      // it is handed.
      {...(As ? { render: React.createElement(As) } : null)}
      {...rest}
    />
  );
});

/* A BUTTON LABEL THAT DROPS AT THE NARROW END OF THE RANGE.
 *
 * It exists because a PAGE CANNOT WRITE `max-[1200px]:hidden` — utilities compile only
 * under components/{ui,primitives}, so the class emits nothing and the label stays at
 * every width, which is how the top bar overflows at 1080. The one control that needs
 * this is the top bar's Filters button: Rhea labels it, and below 1200 the bar is
 * carrying a title, a unit toggle, a scope summary and two glyphs already.
 *
 * `hidden` is safe HERE and nowhere else in this repo: it is applied to a bare <span>
 * with no author `display` of its own, which is the one case the UA rule can win. */
function ButtonLabel({ className, children, ...rest }) {
  return (
    <span data-slot="button-label" className={cn('max-[1200px]:hidden', className)} {...rest}>
      {children}
    </span>
  );
}

/* A STATUS DOT INSIDE A BUTTON — the top bar's account scope wears one.
 *
 * Rhea opens the scope trigger with a dot rather than a layers glyph, and the swap is
 * the point: the glyph said "this is a scope control", which the label already says,
 * where the dot says whether the accounts in that scope are HEALTHY — which nothing
 * else in the bar does.
 *
 * It is never the only carrier of that: the Alerts rail item, the bell's badge and the
 * account card all say the same thing in words. A 6px dot is a reminder, not a report.
 */
const DOT = {
  ok: 'var(--profit)',
  warn: 'var(--warning)',
  bad: 'var(--loss)',
  none: 'var(--text-dim)',
};

function ButtonDot({ tone = 'ok', className, ...rest }) {
  return (
    <span
      data-slot="button-dot"
      aria-hidden="true"
      className={cn('size-1.5 shrink-0 rounded-full', className)}
      style={{ background: DOT[tone] || DOT.ok }}
      {...rest}
    />
  );
}

export { Button, ButtonDot, ButtonLabel, buttonVariants };
