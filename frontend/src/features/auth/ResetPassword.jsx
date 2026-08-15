import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword } from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';
import AuthShell from './AuthShell.jsx';
import { takeTokenFromUrl } from './takeTokenFromUrl.js';

const PASSWORD_MIN = 8;   // mirrors PASSWORD_MIN in src/platform/auth/credentials.js

/**
 * Redeem a reset link and set a new password.
 *
 * The token is lifted out of the URL on first render and never put back — see
 * takeTokenFromUrl. It lives in component state until it is posted, and is
 * never displayed. On success the server issues a session, so this screen lands
 * the user in the app rather than back at the login form.
 */
export default function ResetPassword() {
  const [token] = useState(takeTokenFromUrl);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) {
      return setError(`Use at least ${PASSWORD_MIN} characters.`);
    }
    // Checked here rather than server-side: the confirmation field exists to
    // catch a typo before it becomes a password the user can't reproduce, which
    // is a browser-side concern. The server never sees it.
    if (password !== confirm) return setError('Those two passwords do not match.');

    setBusy(true);
    try {
      setUser(await resetPassword({ token, password }));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        eyebrow="Reset password"
        title="This link is incomplete"
        alt={<Link to="/forgot">Request a new link</Link>}
      >
        <p className="auth-said">
          The address you opened has no reset token in it. Mail clients sometimes cut long
          links in half — requesting a fresh one is the quickest fix.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Reset password"
      title="Set a new password"
      alt={<Link to="/login">Back to log in</Link>}
      note="Setting a new password signs out every other device on this account."
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-field">
          <span>New password</span>
          <input
            type="password" name="password" autoComplete="new-password" required autoFocus
            minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${PASSWORD_MIN} characters`} disabled={busy}
          />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <input
            type="password" name="confirm" autoComplete="new-password" required
            minLength={PASSWORD_MIN} value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again" disabled={busy}
          />
        </label>

        {error && <div className="login-error auth-error" role="alert">{error}</div>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'One moment…' : 'Save password and log in'}
        </button>
      </form>
    </AuthShell>
  );
}
