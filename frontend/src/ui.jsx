import React from 'react';

// ── PropVexis component primitives (Phase 1) ─────────────────────────────────
// Thin, token-backed wrappers over the `.u-*` classes in styles.css. New screens
// should compose these instead of hand-rolling buttons/cards/badges/etc, so the
// design system stays the single source of truth. See design-system/propvexis.

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

// Tabs — controlled segmented control. `tabs` = [{ value, label }].
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
