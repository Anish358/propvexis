import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import TradeSettingsModal from './TradeSettingsModal.jsx';

// Quick-access Settings, opened from the account avatar in the top bar. Mirrors
// the /settings page (profile · plan · trade preferences · sign out) so the
// user's own info is one tap away without leaving the current page. The full
// page still lives at /settings for direct navigation.
export default function SettingsModal({
  onClose,
  unit = 'R',
  tradeSettings = {}, setBeRounding, setColumnVisible, resetColumns,
}) {
  const { user, logout } = useAuth();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const plan = (user?.plan || 'free').toUpperCase();

  return (
    <>
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Settings</h2>
          <button className="x" onClick={onClose}>×</button>
        </header>

        <div className="settings-modal-body">
          <section className="ts-section">
            <h3>Profile</h3>
            <div className="settings-profile">
              {user?.picture && <img className="settings-pic" src={user.picture} alt="" referrerPolicy="no-referrer" />}
              <div className="settings-rows">
                <div className="settings-row"><span className="muted">Name</span><span>{user?.name || '—'}</span></div>
                <div className="settings-row"><span className="muted">Email</span><span>{user?.email}</span></div>
                <div className="settings-row"><span className="muted">Sign-in</span><span>Google account</span></div>
              </div>
            </div>
          </section>

          <section className="ts-section">
            <h3>Plan & billing</h3>
            <div className="settings-row">
              <span className="muted">Current plan</span>
              <span className={`sb-plan-badge ${user?.plan || 'free'}`}>{plan}</span>
            </div>
            <Link to="/billing" className="btn settings-btn" onClick={onClose}>Manage plan →</Link>
          </section>

          <section className="ts-section">
            <h3>Trade preferences</h3>
            <p className="muted">Breakeven rounding precision and trade-log column visibility.</p>
            <button className="btn settings-btn" onClick={() => setPrefsOpen(true)}>Open trade settings</button>
          </section>
        </div>

        <footer>
          <button className="btn danger" onClick={logout}>Sign out</button>
          <span className="footer-spacer" />
          <button className="primary" onClick={onClose}>Done</button>
        </footer>
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
    </>
  );
}
