/* EmptyState — PropVexis primitive.
 *
 * The canonical "nothing here yet" / coming-soon block. Moved here verbatim from
 * `ui.jsx` so that no page has to import from two component layers at once; the
 * markup and the `.u-empty*` classes are unchanged, so this is a zero-visual-change
 * move.
 *
 * NOT LIBRARY-BACKED, AND WON'T BE SOON. Presets ship components, not states — no
 * registry has an empty state, because what belongs in one is a product decision.
 * DESIGN-LANGUAGE §15 is where that gets settled (what an empty state must contain,
 * when it offers an action, how it differs from a filtered-to-nothing result). This
 * file is where that decision will land, and callers will not notice.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

/* IT FADES IN, and this is the one surface where a pure entrance animation is easy to
 * justify. An empty state has NO FIGURES TO READ — that is its definition — so the
 * objection that applies everywhere else on this dashboard (motion in front of a number
 * delays reading it) has nothing to bite on. It is also rare: a trader sees this once,
 * on a screen that would otherwise appear as a bare box, where arriving deliberately
 * reads as designed rather than as failed to load.
 *
 * ONE FADE, NO TRAVEL. §2 keeps layout an invariant, and an empty state that slides is
 * a product apologising for having nothing to show.
 *
 * `--dur` and the shared pv-content-in keyframe, so this cannot drift from the other
 * arrivals. tw-animate-css is imported now, but `animate-in fade-in` would pull in the
 * enter/exit machinery for a plain opacity fade and read its duration from a different
 * variable chain — the owned keyframe stays simpler and is what BriefSection and
 * PageEntrance already use. */
const ENTRANCE = 'animate-[pv-content-in_var(--dur)_var(--ease)_backwards]';

function EmptyState({ icon, title, description, actions, badge, className }) {
  return (
    <div className={cx('u-empty', ENTRANCE, className)}>
      {badge}
      {icon && <div className="u-empty-icon">{icon}</div>}
      {title && <div className="u-empty-title">{title}</div>}
      {description && <div className="u-empty-desc">{description}</div>}
      {actions && <div className="u-empty-actions">{actions}</div>}
    </div>
  );
}

export { EmptyState };
