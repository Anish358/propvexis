import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmVerification, fetchMe } from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';
import AuthShell from './AuthShell.jsx';
import { takeTokenFromUrl } from './takeTokenFromUrl.js';

/**
 * Land here from the link in a verification email.
 *
 * Confirming does NOT create a session — the backend deliberately refuses to
 * treat a 24-hour-lived URL sitting in an inbox as a login credential. So this
 * screen has two endings: an already-logged-in user gets their profile
 * refreshed in place (the banner disappears), and a logged-out one is pointed
 * at the login form.
 */
export default function VerifyEmail() {
  // Lifted out of the URL on mount and not put back — same reasoning as the
  // reset screen, see takeTokenFromUrl.
  const [token] = useState(takeTokenFromUrl);
  const { user, setUser } = useAuth();
  const [state, setState] = useState(token ? 'working' : 'missing');
  const [error, setError] = useState(null);
  // React 18 StrictMode mounts effects twice in development. The token is
  // single-use, so the second run would redeem nothing and report "already
  // used" over a success that just happened.
  const fired = useRef(false);

  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;
    let cancelled = false;
    confirmVerification(token)
      .then(async () => {
        if (cancelled) return;
        setState('done');
        // Refresh the session's copy of the profile so the in-app banner goes
        // away without a reload. Only meaningful when this tab is logged in.
        if (user) {
          try { setUser(await fetchMe()); } catch { /* banner clears on next load */ }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setState('failed');
      });
    return () => { cancelled = true; };
  }, [token]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'missing') {
    return (
      <AuthShell eyebrow="Verify email" title="This link is incomplete"
        alt={<Link to="/login">Back to log in</Link>}>
        <p className="auth-said">
          The address you opened has no token in it. Mail clients sometimes cut long links
          in half — open the one in your email again, or resend it from the app.
        </p>
      </AuthShell>
    );
  }

  if (state === 'working') {
    return (
      <AuthShell eyebrow="Verify email" title="Confirming your address">
        <p className="auth-said">One moment…</p>
      </AuthShell>
    );
  }

  if (state === 'failed') {
    return (
      <AuthShell eyebrow="Verify email" title="That link didn't work"
        alt={user ? <Link to="/">Go to your journal</Link> : <Link to="/login">Back to log in</Link>}
        note="Verification links last 24 hours and work once. Log in and use the banner to send a fresh one.">
        <div className="login-error auth-error" role="alert">{error}</div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Verify email"
      title="Email confirmed"
      alt={user ? <Link to="/">Go to your journal</Link> : <Link to="/login">Log in</Link>}
    >
      <p className="auth-said">
        Thanks — your address is verified. {user ? 'You can close this tab.' : 'You can log in now.'}
      </p>
    </AuthShell>
  );
}
