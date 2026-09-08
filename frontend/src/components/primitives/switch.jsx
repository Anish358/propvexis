/* switch.jsx
 *
 * @design approved 2026-09-07 — the owner has not signed off how this LOOKS. It is not a
 *   §1 step-1 stop: reuse it in existing screens, but a redesigned screen may not
 *   adopt it until it is reviewed. See test/primitives-status.test.js.
 */

import React from 'react';
import { Switch as UISwitch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* Switch — PropVexis primitive.
 *
 * The generated component owns everything that matters about a switch: Base UI's
 * role="switch", the keyboard contract, the thumb's translate/scale animation and the
 * track geometry. None of that is touched here.
 *
 * WHAT IS TOUCHED IS ONE COLOUR — THE UNCHECKED THUMB — AND THE TRACK OVERRIDE IS GONE
 * (owner, 2026-09-07, against the preset's own switch shown side by side).
 *
 * The preset's switch is authored light-first, and its three slots resolve like this
 * through bridge.css TODAY:
 *
 *   checked track   bg-primary    -> --action     -> --zinc-50 (#fafafa, near-white)
 *   unchecked track bg-input      -> --input-line -> rgba(255,255,255,.15) = #3b3b3d on a card
 *   thumb           bg-background -> --bg         -> --zinc-950 (#09090b)
 *
 * THE TRACK OVERRIDE WAS FIXING A MAPPING THAT NO LONGER EXISTS. What stood here forced
 * `data-unchecked:bg-[var(--line-strong)]`, and the note explaining it read
 * `bg-input -> --line -> #1a1a1d` — true when it was written. The bridge now points
 * `--color-input` at `--input-line`, a white alpha, which is the preset's own
 * `oklch(1 0 0 / 15%)` exactly. So the generated track is already right and the override
 * was restating a value one shade DIMMER (#29292c opaque) than what it replaced. Deleted:
 * the unchecked track is the preset's, and it composites on its ground the way an alpha
 * should. That is the seventh time a stale mapping outlived the fix written for it — see
 * menu.jsx's edge note for the same shape of mistake.
 *
 * THE THUMB IS STILL OURS, AND ON PURPOSE. A dark thumb on a near-white checked track is
 * right and is why the thumb is dark. The same dark #09090b on the #3b3b3d unchecked
 * track is about 1.6:1 — legible only if you know it is there, and OFF is the default
 * state of the first switch a trader meets. So the unchecked thumb inverts to `--text`
 * (#fafafa) and the checked half is left exactly as the preset draws it. The owner
 * confirmed this against the preset's own screenshot, where the off switch shows a WHITE
 * thumb on a grey track — which is the reading this produces and the one strict parity
 * does not.
 *
 * THE THUMB IS REACHED FROM THE ROOT, by the root's OWN state rather than the thumb's.
 * ui/switch.jsx hard-codes the thumb's className and is not edited in place (§1), so
 * the wrapper styles it as a descendant. Keying on `data-unchecked` on the ROOT and
 * not on the thumb is deliberate: the root's state is the one Base UI guarantees and
 * the one this file can see, so the selector cannot quietly stop matching if the
 * generated thumb's attributes change under a registry update.
 *
 * tailwind-merge leaves the generated track standing: it only drops a class whose
 * modifier set MATCHES, and nothing here declares a bare `bg-*` or a `data-unchecked:bg-*`
 * any more. That asymmetry has cost this repo a day before (the top bar pills' hover).
 *
 * LABEL IT. A switch with no visible text beside it must carry an `aria-label`; a
 * switch inside a FieldLabel (the registry's own p-field-15 composition, which is what
 * the Add Account page uses) is named by that label's text and needs nothing. */
export function Switch({ className, ...rest }) {
  return (
    <UISwitch
      className={cn(
        'data-unchecked:[&_[data-slot=switch-thumb]]:bg-[var(--text)]',
        className,
      )}
      {...rest}
    />
  );
}
