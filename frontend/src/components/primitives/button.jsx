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
  // for the top bar's account switcher (Phase 4c). It is a FILLED neutral surface
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

/* RADIUS — a locked rule outranking the preset, which is the one case where this
 * wrapper corrects the generated component rather than translating it.
 *
 * The generated Button draws `rounded-2xl` (--r-2xl, ~13px). DESIGN-LANGUAGE §5
 * "assignment by surface" is 🔒 LOCKED and assigns buttons `--r-lg` (~7px), giving
 * --r-2xl to cards and floating overlays instead. §"Legacy CSS is not a layer" is
 * explicit that 🔒 rules still outrank the preset's default appearance, so the rule
 * wins and the correction lives here.
 *
 * It has to be a utility rather than a CSS override because Tailwind's own utility
 * would lose to any unlayered rule; passed through `cn()` (tailwind-merge) it
 * REPLACES `rounded-2xl` in the class string, so there is one radius on the element,
 * not two fighting. Same reason the icon-button radius is not set here: sizes
 * `icon*` are "smaller chrome" in the same table (--r-sm/--r-md) and each caller
 * says which it wants.
 */
const RADIUS = 'rounded-lg';

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
const PILL = 'rounded-full';

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
        RADIUS,
        isChrome && CHROME,
        // An engaged control keeps the hover but not the muted rest, so the two states
        // stay distinguishable — hence only the resting half is conditional.
        isChrome && (active ? 'text-foreground' : CHROME_REST),
        pill && PILL,
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

export { Button, buttonVariants };
