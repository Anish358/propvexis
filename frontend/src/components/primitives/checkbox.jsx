/* checkbox.jsx
 *
 * @design approved 2026-09-07 — owner signed off Batch 2 (Form controls) as a family
 *   on the Test page. Locked WITH the other six: they share a height, a corner and a
 *   text size, and re-opening one re-opens all. See test/primitives-status.test.js.
 */

import React from 'react';
import { Checkbox as UICheckbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/* Checkbox — PropVexis primitive.
 *
 * Renders Base UI's Checkbox via the base-rhea generated component, which carries
 * the accessibility contract: the root is a real control, so it is focusable,
 * keyboard-operable with Space, and exposes checked state to assistive tech. The
 * label pairs by htmlFor/id, exactly as Input's does.
 *
 * IT IS NOT DECORATION. The one thing this app uses it for is the credential
 * consent gate, where an unticked box is what stops a trade-capable password
 * being submitted — so the disabled-submit path depends on its state being real
 * rather than styled. Do not swap it for a styled div.
 *
 * ── THE CORNER IS ON THE SCALE (owner, 2026-09-07) ────────────────────────────────────
 *
 * The generated component asks for `rounded-[5px]` — an arbitrary value, and the only
 * off-scale radius in the form family. Our steps are 6 / 8 / 10 / 14 / 16.
 *
 * ONE PIXEL, AND THE OWNER WAS TOLD SO WHEN ASKED. Nobody will see the difference on a
 * 16px square; the reason to close it is that everything else in the app is on the scale,
 * and a single arbitrary value is how a scale stops being one — the next component copies
 * it, and then the scale is a suggestion. `rounded-sm` is 6px here, so this follows the
 * token rather than restating a number.
 *
 * It is a knowing divergence from the preset, which is normally the thing to avoid, and
 * that is exactly why it was asked rather than tidied. */
export function Checkbox({ className, ...rest }) {
  return <UICheckbox className={cn('rounded-sm', className)} {...rest} />;
}
