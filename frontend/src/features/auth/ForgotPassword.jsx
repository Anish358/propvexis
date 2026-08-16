import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../../lib/api.js';
import AuthShell from './AuthShell.jsx';

/**
 * Ask for a reset link.
 *
 * The success copy deliberately says "if that address has an account" rather
 * than "we've sent you an email". The server answers identically either way to
 * avoid being an account checker, so wording that implies the address was found
 * would leak from the UI exactly what the API refuses to leak.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const address = email.trim();
    if (!address) return setError('Enter your email address.');
    setBusy(true);
    try {
      await requestPasswordReset(address);
      setSent(true);
    } catch (err) {
      // Only a network or rate-limit failure can land here.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        eyebrow="Check your inbox"
        title="Reset link sent"
        alt={<Link to="/login">Back to log in</Link>}
        note="Nothing after a few minutes? Check spam, then try again — the newest link is the only one that works."
      >
        <p className="auth-said">
          If <strong>{email.trim()}</strong> has a PropVexis account, a link to choose a new
          password is on its way. It works for one hour.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Forgot password"
      title="Choose a new password"
      alt={<>Remembered it? <Link to="/login">Log in</Link></>}
      note="Signed up with Google? You can still set a password here — you'll then have both ways in."
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email" name="email" autoComplete="email" required autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com" disabled={busy}
          />
        </label>

        {error && <div className="login-error auth-error" role="alert">{error}</div>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'One moment…' : 'Email me a reset link'}
        </button>
      </form>
    </AuthShell>
  );
}
