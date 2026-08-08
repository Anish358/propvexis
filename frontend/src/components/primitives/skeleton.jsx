import { Skeleton as SkeletonBase } from '@/components/ui/skeleton';

/* Skeleton — PropVexis primitive. The worked example of why this layer exists:
 * it is the one primitive we needed to change, and it is changed here rather than
 * in generated code.
 *
 * A skeleton is decoration. It stands in for content that has not arrived, so
 * there is nothing in it for a screen reader to read — announcing a row of grey
 * boxes is worse than announcing nothing. `aria-hidden` is therefore the correct
 * default, and the generated component does not set it.
 *
 * The counterpart is on the container: the region being loaded should carry
 * `aria-busy="true"` while it waits, so assistive tech knows something is coming
 * rather than that nothing exists. That belongs to whoever owns the region, which
 * is why it is not set here.
 *
 * Callers can still opt out with `aria-hidden={false}` for the rare skeleton that
 * genuinely conveys structure.
 *
 * DESIGN-LANGUAGE §16 leaves skeleton fidelity and timing thresholds undecided —
 * how closely a skeleton mirrors its content, and how long before it appears.
 * Neither is encoded here; this is the mark, not the policy.
 */
function Skeleton({ 'aria-hidden': ariaHidden = true, ...props }) {
  return <SkeletonBase aria-hidden={ariaHidden} {...props} />;
}

export { Skeleton };
