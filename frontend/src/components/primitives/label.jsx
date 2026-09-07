/* label.jsx
 *
 * @design unreviewed — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import React from 'react';
import { Label as UILabel } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/* Label — PropVexis primitive.
 *
 * Renders a plain <label>, so pairing is by htmlFor/id — the generated component
 * does not do that for you.
 *
 * DESIGN-LANGUAGE: labels are Title Case, never all-caps, and carry no extra
 * letter-spacing (N1, N9).
 *
 * ── THE COLOUR IS THE MUTED ONE (owner, 2026-09-07) ───────────────────────────────────
 *
 * `--text-2` at full opacity is the locked standard for label and metadata text, decided
 * on the dashboard against the KPI captions. This file used to record that as a rule it
 * could not enforce — "none of that is enforceable from here" — and the generated
 * component ships `text-foreground`, so every form label in the app was rendering at the
 * same brightness as the value typed under it.
 *
 * The owner was shown both and chose the muted one, so the ruling now covers forms too:
 * ONE label colour in the app, not one for captions and another for questions. There is a
 * real argument the other way, which is why it was asked rather than assumed — a form
 * label is a question you must read to answer, not a caption on a number.
 *
 * `text-muted-foreground` rather than a literal: bridge.css points `--color-muted-
 * foreground` at `--text-2`, so this follows the token instead of freezing its value.
 * It is the same colour `FieldDescription` uses, which is deliberate — they differ by
 * SIZE (14 against 12), not by brightness.
 *
 * `cn()` is tailwind-merge, so this REPLACES the generated `text-foreground` rather than
 * racing it, and a caller can still override by passing their own text colour. */
export function Label({ className, ...rest }) {
  return <UILabel className={cn('text-muted-foreground', className)} {...rest} />;
}
