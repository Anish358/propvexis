import React from 'react';
import {
  Progress as ProgressRoot,
  ProgressIndicator as ProgressIndicatorBase,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/* Progress — PropVexis primitive.
 *
 * THIS WRAPPER EXISTS FOR ONE CORRECTION: motion. The generated indicator draws
 * `transition-all duration-500`, and DESIGN-LANGUAGE §16 (§10 in the current
 * numbering — see the §20 alias table) allows exactly two durations, both from
 * tokens.css: `--dur` (200ms) and `--dur-fast` (120ms). 500ms is off that scale.
 *
 * WHY IT IS STATED AS A UTILITY RATHER THAN LEFT ALONE. bridge.css already points
 * `--default-transition-duration` at `var(--dur)`, so a bare `transition-all` would
 * inherit our curve and duration for free — but an EXPLICIT `duration-500` overrides
 * that default, which is why the generated class has to be displaced rather than
 * simply relied upon. Passed through `cn()` (tailwind-merge) the replacement wins by
 * replacing the class outright, so the element carries one duration instead of two
 * fighting on specificity. Same mechanism button.jsx uses for the radius correction.
 *
 * AND §10's REDUCED-MOTION HALF, which the generated component has no notion of:
 * "prefers-reduced-motion collapses durations to zero — the state change still
 * happens." `motion-reduce:duration-0` is that, as a variant rather than a media
 * block, so it travels with the component instead of living in a stylesheet the
 * component does not know about. A reduced-motion user sees the bar jump to its new
 * value instantly, never sees it not move.
 *
 * WHAT IS DELIBERATELY NOT CORRECTED: `bg-primary` on the indicator. §4 reserves
 * brand blue for "primary actions and data" and requires selection chrome to be
 * grayscale, but a progress track is neither a selection state nor an outcome, and
 * §0 is explicit that this document registers OVERRIDES only — where no override
 * applies, the preset is the source of truth. Keeping the preset's default here is
 * following that rule, not skipping a check.
 */
const MOTION = 'duration-[var(--dur)] motion-reduce:duration-0';

function ProgressIndicator({ className, ...rest }) {
  return <ProgressIndicatorBase className={cn(MOTION, className)} {...rest} />;
}

export {
  ProgressRoot as Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
};
