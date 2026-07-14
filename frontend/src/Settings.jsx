import React, { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { useAuth } from './AuthContext.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';

// Settings — the USER's own info (login identity, plan) + app preferences.
// Trading-account management deliberately lives on the Account page, not here
// (IA decision 2026-07-14). Profile fields are read-only for now: identity
// comes from Google OAuth, so there's no password to change here.
export default function Settings() {
  const { connected, toggleSidebar, unit, tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns } = useOutletContext();
  const { user, logout } = useAuth();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const plan = (user?.plan || 'free').toUpperCase();

  return (
    <div className="page">
      <PageHeader title="Settings" connected={connected} onMenu={toggleSidebar} />
      <div className="dashboard settings-page">

        <div className="panel">
          <h3>Profile</h3>
          <div className="settings-profile">
            {user?.picture && <img className="settings-pic" src={user.picture} alt="" referrerPolicy="no-referrer" />}
            <div className="settings-rows">
              <div className="settings-row"><span className="muted">Name</span><span>{user?.name || '—'}</span></div>
              <div className="settings-row"><span className="muted">Email</span><span>{user?.email}</span></div>
              <div className="settings-row"><span className="muted">Sign-in</span><span>Google account</span></div>
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>Plan & billing</h3>
          <div className="settings-row">
            <span className="muted">Current plan</span>
            <span className={`sb-plan-badge ${user?.plan || 'free'}`}>{plan}</span>
          </div>
          <Link to="/billing" className="btn settings-btn">Manage plan →</Link>
        </div>

        <div className="panel">
          <h3>Trade preferences</h3>
          <p className="muted">Breakeven rounding precision and trade-log column visibility.</p>
          <button className="btn settings-btn" onClick={() => setPrefsOpen(true)}>Open trade settings</button>
        </div>

        <div className="panel">
          <h3>Session</h3>
          <button className="btn settings-btn danger" onClick={logout}>Sign out</button>
        </div>
      </div>

      <TradeSettingsModal
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        unit={unit}
        beRounding={!!tradeSettings.beRounding}
        setBeRounding={setBeRounding}
        columnOverrides={tradeSettings.columns || {}}
        setColumnVisible={setColumnVisible}
        resetColumns={resetColumns}
      />
    </div>
  );
}
