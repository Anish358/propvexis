/* Tabs — PropVexis primitive.
 *
 * THE ONE TAB / SWITCHER PATTERN FOR THE APP. Use this for any multi-view, filter or
 * category switcher instead of inventing a new tab style. Underline-based: a thin
 * accent line under the active label, muted and underline-less when inactive, a
 * faint underline preview on hover. No filled pill, no bordered box.
 *
 * `tabs` = [{ value, label }].
 *
 * If a switcher needs richer per-tab content than a single label — icons, multi-line
 * text, dividers, fixed widths, as the Dashboard's account selector does — it cannot
 * use this API, but it MUST still follow the same underline interaction pattern. See
 * Dashboard.jsx's AccountHeader / `.dash-acct-tab` for that reference implementation.
 *
 * Moved here verbatim from `ui.jsx`, still on `.u-tabs` / `.u-tab`. Tabs is the LAST
 * primitive scheduled for library adoption (UI-MIGRATION-PLAN §19, Phase 4a) and the
 * reason is visible in the paragraph above: it is the most opinionated component in
 * the app, its interaction pattern is a documented design-system rule rather than a
 * default, and a generated tab list arrives with its own idea of all of that. It is
 * also the only primitive here with real keyboard obligations — arrow-key roving
 * focus, which this hand-rolled version does not implement and Base UI does. That is
 * the payoff when it lands, and it lands on its own, not as a side effect of a page
 * migration.
 */

const cx = (...parts) => parts.filter(Boolean).join(' ');

function Tabs({ tabs = [], value, onChange, className }) {
  return (
    <div className={cx('u-tabs', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          className={cx('u-tab', t.value === value && 'is-active')}
          onClick={() => onChange?.(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { Tabs };
