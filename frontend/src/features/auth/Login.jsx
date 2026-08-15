import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginWithGoogle, loginWithPassword, signupWithPassword } from '../../lib/api.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { BRAND } from '../../lib/theme.js';
import AuthShell from './AuthShell.jsx';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const PASSWORD_MIN = 8;   // mirrors PASSWORD_MIN in src/platform/auth/credentials.js

// Load the Google Identity Services script once.
function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function EyeIcon({ off }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="21" x2="21" y2="3" />}
    </svg>
  );
}

function GoogleIcon() {
  // Google's four-brand-colour G, required by their branding guidelines even on
  // a custom button.
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

// mode: 'login' (default) or 'signup'. One screen serves both — the fields, copy
// and endpoint change, the layout doesn't.
export default function Login({ mode = 'login' }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const btnRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const isSignup = mode === 'signup';

  const done = (user) => {
    setUser(user);
    navigate('/', { replace: true });
  };

  useEffect(() => {
    // Google is optional now: without a client id the email form still works,
    // so this is no longer a page-level error.
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              done(await loginWithGoogle(credential));
            } catch (e) {
              setError(e.message === 'this account is not allowed'
                ? 'This Google account is not on the allowlist.'
                : `Sign-in failed: ${e.message}`);
            }
          },
        });
        // Rendered at the real size but visually hidden — our own button sits
        // underneath it (see .auth-google in styles.css), because the widget is
        // an iframe we can't restyle and its white logo tile clashes with the
        // dark page.
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: isSignup ? 'signup_with' : 'signin_with',
          width: 320,
        });
        setReady(true);
      })
      .catch(() => setError('Could not load Google sign-in. Use your email and password.'));
    return () => { cancelled = true; };
  }, [navigate, setUser, isSignup]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const email = form.email.trim();
    if (!email || !form.password) return setError('Enter your email and password.');
    if (isSignup && form.password.length < PASSWORD_MIN) {
      return setError(`Use at least ${PASSWORD_MIN} characters for your password.`);
    }
    setBusy(true);
    try {
      done(isSignup
        ? await signupWithPassword({ name: form.name.trim(), email, password: form.password })
        : await loginWithPassword({ email, password: form.password }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow={isSignup ? 'Start for free' : 'Welcome back'}
      title={isSignup ? 'Create new account' : 'Log in to your journal'}
      alt={isSignup ? (
        <>Already a member? <Link to="/login">Log in</Link></>
      ) : (
        <>New to {BRAND}? <Link to="/signup">Create an account</Link></>
      )}
      note={isSignup
        ? 'Free plan, no card. If you later sign in with Google on this address it takes over the same account, replacing the password.'
        : 'Signed up with Google? Use the Google button above.'}
    >
      <form className="auth-form" onSubmit={submit} noValidate>
            {isSignup && (
              <label className="auth-field">
                <span>Name <em>optional</em></span>
                <input
                  type="text" name="name" autoComplete="name" value={form.name}
                  onChange={set('name')} placeholder="Anish Shejawale" disabled={busy}
                />
              </label>
            )}
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email" name="email" autoComplete="email" required value={form.email}
                onChange={set('email')} placeholder="you@email.com" disabled={busy}
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <span className="auth-pw">
                <input
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  minLength={isSignup ? PASSWORD_MIN : undefined}
                  value={form.password}
                  onChange={set('password')}
                  placeholder={isSignup ? `At least ${PASSWORD_MIN} characters` : '••••••••'}
                  disabled={busy}
                />
                <button
                  type="button" className="auth-pw-toggle" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
                >
                  <EyeIcon off={showPw} />
                </button>
              </span>
            </label>

            {!isSignup && (
              <p className="auth-forgot">
                <Link to="/forgot">Forgot your password?</Link>
              </p>
            )}

            {error && <div className="login-error auth-error" role="alert">{error}</div>}

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? 'One moment…' : isSignup ? 'Create account' : 'Log in'}
            </button>
          </form>

      {CLIENT_ID && (
        <>
          <div className="auth-or"><span>or</span></div>
          {/* Our button is the visible layer; the real (transparent) Google
              widget is stacked on top so the click still goes to Google. */}
          <div className="auth-google" data-ready={ready ? 'yes' : 'no'}>
            <span className="auth-google-face" aria-hidden="true">
              <GoogleIcon />
              {isSignup ? 'Sign up with Google' : 'Log in with Google'}
            </span>
            <div ref={btnRef} className="auth-gsi" />
          </div>
        </>
      )}
    </AuthShell>
  );
}
