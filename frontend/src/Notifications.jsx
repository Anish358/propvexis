import React, { useState, useRef, useEffect } from 'react';

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

export function NotificationBell({ notifications = [], unread = 0, onMarkAllRead, inline = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className={`notif ${inline ? 'notif-inline' : ''}`} ref={ref}>
      <button className="notif-bell" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <BellIcon />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
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
        </div>
      )}
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
