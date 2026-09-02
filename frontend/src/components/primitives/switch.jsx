import React from 'react';
import { Switch as UISwitch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* Switch — PropVexis primitive.
 *
 * The generated component owns everything that matters about a switch: Base UI's
 * role="switch", the keyboard contract, the thumb's translate/scale animation and the
 * track geometry. None of that is touched here.
 *
 * WHAT IS TOUCHED IS ONE COLOUR PAIR, AND IT IS A BUG RATHER THAN A PREFERENCE — the
 * same standing as FieldError's red in field.jsx. The preset's switch is authored
 * light-first, and its two slots resolve like this through bridge.css:
 *
 *   checked track   bg-primary    -> --action  -> --zinc-50   (#fafafa, near-white)
 *   unchecked track bg-input      -> --line    -> #1a1a1d
 *   thumb           bg-background -> --bg      -> --zinc-950  (#09090b)
 *
 * A dark thumb on a near-white track is right, and is why the thumb is dark. The
 * SAME dark thumb on a #1a1a1d track is a 1.05:1 contrast ratio — the off switch has
 * no visible thumb at all, so it reads as an empty pill and the control loses the
 * only thing that says which way it is set. Off is the DEFAULT state of the first
 * switch in this app, so the invisible half is the half a trader sees first.
 *
 * The fix keeps the checked half exactly as the preset draws it and gives the
 * unchecked half the two values the app's own switch has always used (legacy
 * `.switch` / `.switch-knob`, still live in Prop OS): a visible mid-grey track with a
 * lighter knob on it. `--line-strong` is the token documented as THE standard visible
 * border and `--text-4` as quiet metadata — an off switch should be legible and
 * quiet, which is what that pair says. No new value is introduced and the preset's
 * on-state is untouched, so this is not a foundation change.
 *
 * THE THUMB IS REACHED FROM THE ROOT, by the root's OWN state rather than the thumb's.
 * ui/switch.jsx hard-codes the thumb's className and is not edited in place (§1), so
 * the wrapper styles it as a descendant. Keying on `data-unchecked` on the ROOT and
 * not on the thumb is deliberate: the root's state is the one Base UI guarantees and
 * the one this file can see, so the selector cannot quietly stop matching if the
 * generated thumb's attributes change under a registry update.
 *
 * tailwind-merge leaves both halves standing: it only drops a class whose modifier set
 * MATCHES, so `data-unchecked:bg-*` replaces the generated `data-unchecked:bg-input`
 * and touches neither the bare `bg-*` nor `data-checked:bg-*`. That asymmetry has cost
 * this repo a day before (the top bar pills' hover) — it is what makes this work.
 *
 * LABEL IT. A switch with no visible text beside it must carry an `aria-label`; a
 * switch inside a FieldLabel (the registry's own p-field-15 composition, which is what
 * the Add Account page uses) is named by that label's text and needs nothing. */
export function Switch({ className, ...rest }) {
  return (
    <UISwitch
      className={cn(
        'data-unchecked:bg-[var(--line-strong)]',
        'data-unchecked:[&_[data-slot=switch-thumb]]:bg-[var(--text-4)]',
        className,
      )}
      {...rest}
    />
  );
}
