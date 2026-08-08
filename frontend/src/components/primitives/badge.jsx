/* Badge — PropVexis primitive.
 *
 * STILL ON `.u-badge`, DELIBERATELY, AND THIS IS THE INTERESTING CASE IN THIS
 * DIRECTORY. The generated `ui/badge.jsx` exists and is a perfectly good pill, but
 * it cannot express this component's API. Our vocabulary is a `tone`, and four of
 * its six values are domain colours:
 *
 *     neutral  brand  |  profit  loss  warn  ai
 *     ----------------    -----------------------
 *     library has these   library has NOTHING for these
 *
 * shadcn knows `destructive`; it does not know that a losing trade is not a failed
 * action, that a break-even is neither, or that `ai` is its own semantic. Mapping
 * the two it does have onto library variants and leaving the other four on legacy
 * CSS would give one component two styling systems — the drift the one-source rule
 * exists to prevent (UI-MIGRATION-PLAN §14, R8).
 *
 * So the seam moves and the implementation does not. Callers import `Badge` from
 * this directory like every other primitive; the day the domain-badge decision
 * lands (DESIGN-LANGUAGE §4, domain ring) this file changes and not one caller
 * does. That is the same contract as the rest of the layer, just pointing the
 * other way: a module can hold the OLD implementation as legitimately as it holds
 * a re-export of the new one.
 *
 * `badgeVariants` is deliberately not re-exported. It belongs to the generated
 * component this one does not use, and exporting both would invite the second
 * Badge.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

// tone: neutral | brand | profit | loss | warn | ai
function Badge({ tone = 'neutral', className, children, ...rest }) {
  return (
    <span className={cx('u-badge', `u-badge--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}

export { Badge };
