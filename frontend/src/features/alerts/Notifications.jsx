import React from 'react';
import { AlertCircle, AlertTriangle, Bell, Sparkles } from 'lucide-react';
// PHASE 4b — the bell's feed is a Popover on Base UI.
// PHASE 4c — the BELL is a generated Button and `.notif-bell` / `.notif-badge` are
// deleted. 4b moved behaviour only, and legacy CSS is unlayered, so the trigger kept
// painting itself the old way no matter what the preset emitted.
// `.notif-panel` is untouched: the feed's own appearance is a separate module and the
// migration plan's rule is wholesale-or-not-at-all per module.
import { Link } from 'react-router-dom';
import {
  Button, CountBadge, EmptyState, Popover, PopoverContent, PopoverTrigger,
} from '@/components/primitives';

// In-app alert UI: a header bell with an unread badge + a dropdown feed, and a
// transient toast stack for alerts that arrive live over the socket. Severity
// reuses the Prop OS status palette (info / warning / critical).

export const sevClass = (s) => (s === 'critical' ? 'crit' : s === 'warning' ? 'warn' : 'info');

export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// A feed, not a list of commands, so it is a Popover: the panel already declared
// role="dialog" itself, and Tab through its "Mark all read" button is the right
// interaction rather than arrow-keying between alerts. The primitive supplies the
// Escape, the focus return and the aria-expanded the hand-rolled version never had —
// the bell's own aria-label, which carries the unread count, is unchanged.
/* One glyph per severity — the same three the dashboard's Brief uses, so a breach looks
 * like a breach in both places. Kept beside `sevClass` rather than imported from the
 * Dashboard, because the direction of dependency matters: alerts are the source of this
 * vocabulary and the Brief is a second surface for it, not the other way round. */
const SEV_ICON = { crit: AlertCircle, warn: AlertTriangle, info: Sparkles };

function SevGlyph({ severity }) {
  const Icon = SEV_ICON[sevClass(severity)] || Sparkles;
  return <Icon aria-hidden="true" />;
}

/* `defaultOpen` exists for the gitignored visual harness (frontend/.preview.jsx), which
 * is the only way to SEE this panel — there is no jsdom here, and the alternative is
 * screenshotting a click. It defaults false, so nothing in the app opens on mount. */
export function NotificationBell({
  notifications = [], unread = 0, onMarkAllRead, inline = false, defaultOpen = false,
}) {
  return (
    <div className={`notif ${inline ? 'notif-inline' : ''}`}>
      <Popover defaultOpen={defaultOpen}>
        {/* `variant="chrome"` at `size="icon-sm"` is the whole of what `.notif-bell`
            and its `.notif-inline` override used to draw between them. `tone="alert"`
            is why the pill is red: an unread count reports a condition rather than a
            selection, so §4's neutral-selection lock does not reach it.
            The containing block the corner count positions against comes from
            `.notif-inline` in legacy CSS — a utility here would not be compiled, since
            `@source` covers `components/` only. */}
        <PopoverTrigger
          /* `pill` since 2026-08-28: every control in the top bar is a capsule at one
             height, and the bell was the last rounded-rect in the row. The count badge,
             the popover, the aria-label and the corner positioning are unchanged — the
             component was already primitive-backed, so this is the shape only. */
          render={<Button variant="chrome" size="icon-sm" pill />}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Bell aria-hidden="true" />
          {unread > 0 && (
            <CountBadge tone="alert" corner>{unread > 99 ? '99+' : unread}</CountBadge>
          )}
        </PopoverTrigger>
        <PopoverContent className="notif-panel" aria-label="Notifications">
          <div className="notif-head">
            <span>Notifications</span>
            {unread > 0 && <button className="notif-markall" onClick={onMarkAllRead}>Mark all read</button>}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <EmptyState
                title="You're all caught up"
                description="Breaches, drawdown warnings and milestones land here as they happen."
              />
            ) : notifications.map((n) => (
              <div key={n.id} className={`notif-item ${sevClass(n.severity)} ${n.read_at ? '' : 'unread'}`}>
                {/* THE SAME GLYPH THE BRIEF USES for this severity, not a bare dot.
                    A triangle for a warning and a filled circle for a breach are
                    recognisable before they are read, they survive a greyscale screen,
                    and — the reason it matters here — a trader who has just seen
                    "challenge breached" in Today's Brief meets the identical mark in
                    this panel rather than a colour they have to re-learn. */}
                <span className="notif-glyph" aria-hidden="true"><SevGlyph severity={n.severity} /></span>
                <div className="notif-body">
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="notif-text">{n.body}</div>}
                  <div className="notif-time">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
          {/* A WAY OUT OF A PANEL THAT ONLY EVER SHOWS THE LATEST FEW. The feed is
              capped, so without this the older alerts were unreachable from the one
              place a trader goes looking for them. */}
          <div className="notif-foot">
            <Link to="/alerts">View all alerts</Link>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function Toasts({ items = [], onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <button key={t.key} className={`toast ${sevClass(t.severity)}`} onClick={() => onDismiss(t.key)}>
          <div className="toast-title">{t.title}</div>
          {t.body && <div className="toast-text">{t.body}</div>}
        </button>
      ))}
    </div>
  );
}
