import React from 'react';
// PHASE 4b — the bell's feed is a Popover on Base UI. Behaviour and positioning only;
// `.notif-panel` keeps its own appearance, so the panel looks identical.
import { Popover, PopoverContent, PopoverTrigger } from '@/components/primitives';

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

const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// A feed, not a list of commands, so it is a Popover: the panel already declared
// role="dialog" itself, and Tab through its "Mark all read" button is the right
// interaction rather than arrow-keying between alerts. The primitive supplies the
// Escape, the focus return and the aria-expanded the hand-rolled version never had —
// the bell's own aria-label, which carries the unread count, is unchanged.
export function NotificationBell({ notifications = [], unread = 0, onMarkAllRead, inline = false }) {
  return (
    <div className={`notif ${inline ? 'notif-inline' : ''}`}>
      <Popover>
        <PopoverTrigger className="notif-bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <BellIcon />
          {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
        </PopoverTrigger>
        <PopoverContent className="notif-panel" aria-label="Notifications">
          <div className="notif-head">
            <span>Notifications</span>
            {unread > 0 && <button className="notif-markall" onClick={onMarkAllRead}>Mark all read</button>}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">You're all caught up.</div>
            ) : notifications.map((n) => (
              <div key={n.id} className={`notif-item ${sevClass(n.severity)} ${n.read_at ? '' : 'unread'}`}>
                <span className="notif-dot" aria-hidden="true" />
                <div className="notif-body">
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="notif-text">{n.body}</div>}
                  <div className="notif-time">{timeAgo(n.created_at)}</div>
                </div>
              </div>
            ))}
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
