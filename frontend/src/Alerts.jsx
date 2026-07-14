import React from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { sevClass, timeAgo } from './Notifications.jsx';

// Prop OS › Alerts — the full-page view of the in-app alert feed (same data the
// header bell shows, without the 8-item cap). Feed state lives in App and
// arrives via Outlet context; severity styling reuses the notif-* classes.
export default function Alerts() {
  const { connected, toggleSidebar, notifications = [], unread = 0, markAllNotificationsRead } = useOutletContext();

  return (
    <div className="page">
      <PageHeader
        title="Alerts"
        connected={connected}
        onMenu={toggleSidebar}
        right={unread > 0 && (
          <button className="notif-markall" onClick={markAllNotificationsRead}>
            Mark all read ({unread})
          </button>
        )}
      />
      <div className="panel alerts-page">
        {notifications.length === 0 && (
          <div className="notif-empty">No alerts yet — rule-breach, proximity and milestone alerts will appear here.</div>
        )}
        {notifications.map((n) => (
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
  );
}
