import React from 'react';
import {
  ToggleGroup as UIToggleGroup,
  ToggleGroupItem as UIToggleGroupItem,
  ToggleGroupSeparator,
} from '@/components/ui/toggle-group';

/* ToggleGroup — PropVexis primitive.
 *
 * WHY THIS WRAPPER EXISTS: two reasons, and both are the seam doing its job.
 *
 * 1. FOCUS RING. `ui/toggle-group.jsx` and `ui/toggle.jsx` were pulled from the
 *    `@coss` registry, whose base style is not our locked preset. Its focus
 *    treatment is `ring-2 ring-ring` with a 1px offset; every other control in this
 *    app — Button above all — draws `border-ring` plus `ring-3 ring-ring/30`, no
 *    offset. Two focus rings side by side in one top bar is exactly the third visual
 *    system DESIGN-LANGUAGE "the preset outranks legacy CSS" exists to prevent, so
 *    the coss values are overridden here, once, rather than at each call site.
 *    Overriding via `className` is correct and not a hack: `cn()` is tailwind-merge,
 *    so these utilities REPLACE the generated ones instead of racing them on
 *    specificity — the mechanism the legacy stylesheet could never offer.
 *
 *    Radius is deliberately NOT touched. The coss toggle's `rounded-lg` already is
 *    DESIGN-LANGUAGE §5 "assignment by surface" (buttons → `--r-lg`).
 *
 * 2. A SEGMENTED CONTROL CANNOT BE EMPTY. Base UI's `multiple={false}` still lets
 *    you un-press the pressed item, which for a mode switch (R vs $) means a state
 *    where neither unit is chosen and the page has nothing to render. `exclusive`
 *    below is that guard, expressed once: it takes and returns a plain string
 *    instead of Base UI's array, and a click on the already-pressed item is ignored
 *    rather than clearing the group.
 *
 * The array API is still exported unchanged as `ToggleGroup` for the multi-select
 * case, so nothing here removes a capability.
 */

const FOCUS =
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-offset-0';

function ToggleGroup({ className, ...rest }) {
  return <UIToggleGroup className={className} {...rest} />;
}

function ToggleGroupItem({ className, ...rest }) {
  return <UIToggleGroupItem className={[FOCUS, className].filter(Boolean).join(' ')} {...rest} />;
}

/* Exactly-one-of-N. `value`/`onValueChange` speak a single string; the array is an
 * implementation detail of the library and stops at this boundary. */
function ToggleGroupExclusive({ value, onValueChange = () => {}, ...rest }) {
  return (
    <ToggleGroup
      value={value == null ? [] : [value]}
      // An empty `next` is the un-press we refuse; anything else is a real switch.
      onValueChange={(next) => { if (next.length) onValueChange(next[0]); }}
      {...rest}
    />
  );
}

export { ToggleGroup, ToggleGroupExclusive, ToggleGroupItem, ToggleGroupSeparator };
