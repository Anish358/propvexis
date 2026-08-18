import React, { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/primitives';
import {
  deleteAccountCredential,
  fetchAccountSync,
  saveAccountCredential,
  syncAccountNow,
} from '../../lib/api.js';

// Live sync setup for ONE account — the UI half of the self-hosted MT5 terminal
// farm. Where the EA route asks the trader to install software on a PC they leave
// running, this asks for a read-only password and runs the terminal for them, so
// trades taken on the phone still reach the journal.
//
// The password is write-only by construction: no endpoint returns it, and this
// component never holds it after a successful save. What it shows instead is the
// verdict the terminal reported — `read_only` — because "we only read, never
// trade" is a thing the backend checks on every login, not a promise in copy.

const fmtWhen = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString('en-US', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const JOB_LABEL = {
  queued: 'Queued', leased: 'Syncing now', done: 'Synced', failed: 'Failed',
};

function StatusRows({ state }) {
  const { credential: cred, last_job: job, market_open: marketOpen } = state;
  return (
    <table className="sync-status">
      <tbody>
        <tr>
          <td>Credential</td>
          <td className="num">
            {!cred ? 'Not set'
              : cred.read_only === true ? 'Verified read-only'
              : cred.read_only === false ? 'Rejected — can trade'
              : 'Awaiting first login'}
          </td>
        </tr>
        {cred && <tr><td>Server</td><td className="num">{cred.server}</td></tr>}
        {cred && <tr><td>Last verified</td><td className="num">{fmtWhen(cred.verified_at)}</td></tr>}
        <tr>
          <td>Last sync</td>
          <td className="num">
            {job ? `${JOB_LABEL[job.status] || job.status} · ${fmtWhen(job.finished_at || job.created_at)}` : '—'}
          </td>
        </tr>
        {job?.stats?.trades != null && (
          <tr><td>Trades last run</td><td className="num">{job.stats.trades}</td></tr>
        )}
        <tr>
          <td>Market</td>
          <td className="num">{marketOpen ? 'Open' : 'Closed — scheduled syncs paused'}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function SyncModal({ account, onClose, onChanged }) {
  const [state, setState] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [server, setServer] = useState('');
  const [login, setLogin] = useState(account.mt5_login ? String(account.mt5_login) : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchAccountSync(account.id);
      setState(s);
      setServer((prev) => prev || s.credential?.server || '');
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e.message);
    }
  }, [account.id]);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setNote(null);
    try {
      await saveAccountCredential(account.id, {
        server: server.trim(),
        login: login ? Number(login) : undefined,
        // The firm the account was created from already names which portable MT5
        // build to log in with, so there is nothing to ask the user here.
        firm_key: account.firm_id || undefined,
        password,
      });
      setPassword('');
      setNote('Saved — a first sync is queued.');
      await load();
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true); setErr(null); setNote(null);
    try {
      const { queued } = await syncAccountNow(account.id);
      setNote(queued ? 'Sync queued.' : 'A sync is already queued for this account.');
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Remove the stored password? Live sync stops until you add it again.')) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      await deleteAccountCredential(account.id);
      setNote('Password removed.');
      await load();
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const cred = state?.credential;
  const unconfigured = state && state.configured === false;

  return (
    <Modal onClose={onClose} className="sync-modal" label="Live sync">
      <div className="modal-head">
        <h3>Live sync — {account.label || `MT5 ${account.mt5_login}`}</h3>
        <button className="modal-x" onClick={onClose}>✕</button>
      </div>

      <div className="sync-body">
        <p className="muted sync-intro">
          We run MT5 on our own server and read your closed trades, so trades you take
          on your phone reach the journal without a PC left running.
          {' '}<strong>Use your investor (read-only) password</strong> — a password that
          can place trades is rejected and deleted on the first login.
        </p>

        {loadErr && <div className="login-error">{loadErr}</div>}
        {unconfigured && (
          <div className="login-error">
            Live sync isn’t configured on this server yet. Nothing is stored until it is.
          </div>
        )}
        {state && <StatusRows state={state} />}

        {cred?.read_only === false && (
          <div className="login-error">
            The password you gave can place trades, so it was deleted. Enter the
            investor password instead.
          </div>
        )}
        {cred?.last_error && cred.read_only !== false && (
          <div className="sync-warn">Last error: {cred.last_error}</div>
        )}

        <form className="sync-form" onSubmit={save}>
          <label>
            MT5 server
            <input
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="GoatFunded-Server"
              autoComplete="off"
            />
          </label>
          <label>
            MT5 login
            <input
              type="number"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="314943467"
              // Once an account is bound to a login it cannot be repointed — the
              // trades already filed under it would change owner.
              disabled={account.mt5_login != null}
            />
          </label>
          <label>
            Investor password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={cred ? 'Replace the stored password' : 'Read-only password'}
              autoComplete="new-password"
            />
          </label>

          {err && <div className="login-error">{err}</div>}
          {note && <div className="sync-note">{note}</div>}

          <div className="sync-actions">
            {cred && (
              <button type="button" onClick={remove} disabled={busy}>Remove</button>
            )}
            {cred && cred.read_only !== false && (
              <button type="button" onClick={syncNow} disabled={busy}>Sync now</button>
            )}
            <button type="submit" className="primary" disabled={busy || !server.trim() || !password}>
              {busy ? 'Saving…' : cred ? 'Replace password' : 'Enable live sync'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
