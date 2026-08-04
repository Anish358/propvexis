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

function EmptyState({ icon, title, description, actions, badge, className }) {
  return (
    <div className={cx('u-empty', className)}>
      {badge}
      {icon && <div className="u-empty-icon">{icon}</div>}
      {title && <div className="u-empty-title">{title}</div>}
      {description && <div className="u-empty-desc">{description}</div>}
      {actions && <div className="u-empty-actions">{actions}</div>}
    </div>
  );
}

export { EmptyState };
