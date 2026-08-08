import React from 'react';

// ── PropVexis component primitives (Phase 1) — SUPERSEDED ────────────────────
//
// DO NOT IMPORT FROM THIS FILE. It has no importers left: every page now goes
// through `@/components/primitives`, which is the single component entry point
// (see that directory's index.js for why).
//
// It is still here on purpose. UI-MIGRATION-PLAN §22 makes this facade the
// migration's kill switch: its public API is identical to the primitives layer's,
// so reverting a primitive that turns out wrong is a one-line import change per
// page rather than a rewrite. It is deleted when the primitives layer has been in
// production long enough that nobody would want it back — not on the day the last
// caller moved off it.
//
// Thin, token-backed wrappers over the `.u-*` classes in the legacy stylesheet.
// Those classes stay defined either way: `Field`, `Input`, `Select` and `Textarea`
// below never had a caller to migrate, and two files use `.u-*` directly.

const cx = (...parts) => parts.filter(Boolean).join(' ');

// Button — variant: primary | secondary | ghost | danger; size: sm | md | lg.
// `as` lets it render a different element (e.g. Link, "a") while keeping styles.
export function Button({
  variant = 'secondary', size = 'md', block = false,
  as: As = 'button', className, children, ...rest
}) {
  return (
    <As
      className={cx('u-btn', `u-btn--${variant}`, size !== 'md' && `u-btn--${size}`, block && 'u-btn--block', className)}
      {...rest}
    >
      {children}
    </As>
  );
}

// Card — surface container. `hover` adds a border highlight; `flush` removes padding.
export function Card({ hover = false, flush = false, className, children, ...rest }) {
  return (
    <div className={cx('u-card', hover && 'u-card--hover', flush && 'u-card--flush', className)} {...rest}>
      {children}
    </div>
  );
}

// Badge — tone: neutral | brand | profit | loss | warn | ai.
export function Badge({ tone = 'neutral', className, children, ...rest }) {
  return <span className={cx('u-badge', `u-badge--${tone}`, className)} {...rest}>{children}</span>;
}

// Tabs — DESIGN SYSTEM RULE: the one tab/switcher pattern for the app. Use
// this for any multi-view, filter, or category switcher instead of inventing
// a new tab style. Underline-based (thin accent line under the active label,
// muted/no-underline inactive, faint underline preview on hover) — no filled
// pill, no bordered box. `tabs` = [{ value, label }].
//
// If a switcher needs richer per-tab content than a single label (icons,
// multi-line text, dividers, fixed widths — e.g. the Dashboard's account
// selector), it can't use this component's simple API, but it MUST still
// follow the same underline interaction pattern for consistency; see
// Dashboard.jsx's AccountHeader/.dash-acct-tab for that reference
// implementation.
export function Tabs({ tabs = [], value, onChange, className }) {
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

// Field — label + control wrapper. Pass `hint` or `error` for helper text.
export function Field({ label, hint, error, htmlFor, className, children }) {
  return (
    <div className={cx('u-field', className)}>
      {label && <label className="u-field-label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="u-field-error">{error}</span> : hint && <span className="u-field-hint">{hint}</span>}
    </div>
  );
}
export const Input = ({ className, ...p }) => <input className={cx('u-input', className)} {...p} />;
export const Select = ({ className, children, ...p }) => <select className={cx('u-select', className)} {...p}>{children}</select>;
export const Textarea = ({ className, ...p }) => <textarea className={cx('u-textarea', className)} {...p} />;

// Skeleton — loading placeholder. variant: text | title | block | circle.
export function Skeleton({ variant = 'text', width, height, className, style, ...rest }) {
  return (
    <div
      className={cx('u-skeleton', `u-skeleton--${variant}`, className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}

// LoadingBlock — a generic dashboard-shaped skeleton for page-level loading
// (title + KPI row + chart), a perceived-performance upgrade over a text spinner.
export function LoadingBlock({ label = 'Loading', kpis = 4 }) {
  return (
    <div className="u-loading" aria-busy="true" aria-label={label}>
      <Skeleton variant="title" />
      <div className="u-skel-kpis">
        {Array.from({ length: kpis }).map((_, i) => <Skeleton key={i} variant="block" height={96} />)}
      </div>
      <Skeleton variant="block" height={280} />
    </div>
  );
}

// EmptyState — the canonical "nothing here yet" / coming-soon block.
export function EmptyState({ icon, title, description, actions, badge, className }) {
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
