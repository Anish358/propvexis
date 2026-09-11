/* input.jsx
 *
 * @design approved 2026-09-07 — owner signed off Batch 2 (Form controls) as a family
 *   on the Test page. Locked WITH the other six: they share a height, a corner and a
 *   text size, and re-opening one re-opens all. See test/primitives-status.test.js.
 */

import React from 'react';
import { Input as UIInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/* Input — PropVexis primitive.
 *
 * Border is `border-input` = var(--line); focus ring is `ring-ring` =
 * var(--accent-ring), so the focus treatment is the app's, not the library's.
 * Renders Base UI's Input, which carries the accessibility contract.
 *
 * ── IT STOPPED BEING A BARE RE-EXPORT ON 2026-09-08 ───────────────────────────────────
 *
 * One class, and it is a correction rather than a preference (owner: "the pills which are
 * disabled should have cursor change when hover over disabled pill or text field").
 *
 * The generated Input already declares `disabled:cursor-not-allowed`. It has never once
 * rendered, because the same class list also declares `disabled:pointer-events-none` —
 * and an element that receives no pointer events is an element the cursor never enters,
 * so no `cursor` value can apply to it. The rule was present, correct, and inert.
 *
 * Textarea and Checkbox omit `pointer-events-none` and have been showing the right cursor
 * all along; Button and Input did not. That is how the app came to be inconsistent about
 * it without anyone having decided to be.
 *
 * `button.jsx` carries the same constant and the long version of this note. The two must
 * stay in step — a disabled field and a disabled button sit on the same form.
 *
 * NOTE THIS IS A LOCKED PRIMITIVE. Batch 2 was signed off on 2026-09-07 and this changes
 * one of its members the day after, which the review plan says is allowed only as a
 * deliberate decision rather than a drive-by. It is: the owner asked for it directly, and
 * it restores a rule the component already stated. */
const DISABLED_CURSOR = 'disabled:pointer-events-auto disabled:cursor-not-allowed';

export function Input({ className, ...rest }) {
  return <UIInput className={cn(DISABLED_CURSOR, className)} {...rest} />;
}
