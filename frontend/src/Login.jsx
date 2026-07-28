import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginWithGoogle } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { BRAND } from './theme.js';
import AuthArt from './AuthArt.jsx';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const SITE = 'https://propvexis.com';

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

const POINTS = [
  'Closed trades sync straight from MetaTrader — no spreadsheet.',
  'R-based analytics, prop-firm rules and drawdown tracked live.',
  'Free to start. No card, no trial clock.',
];

// mode: 'login' (default) or 'signup'. Google sign-in is the same OAuth flow for
// both (a new account is created on first use), so this only changes the copy +
// the Google button label. The marketing site deep-links to /signup.
export default function Login({ mode = 'login' }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const btnRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const isSignup = mode === 'signup';

  useEffect(() => {
    if (!CLIENT_ID) {
      setError('Google sign-in is not configured (missing VITE_GOOGLE_CLIENT_ID).');
      return;
    }
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            try {
              const user = await loginWithGoogle(credential);
              setUser(user);
              navigate('/', { replace: true });
            } catch (e) {
              setError(e.message === 'this account is not allowed'
                ? 'This Google account is not on the allowlist.'
                : `Sign-in failed: ${e.message}`);
            }
          },
        });
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: isSignup ? 'signup_with' : 'signin_with',
          width: 300,
        });
        setReady(true);
      })
      .catch(() => setError('Could not load Google sign-in. Check your connection.'));
    return () => { cancelled = true; };
  }, [navigate, setUser, isSignup]);

  return (
    <div className="auth-screen">
      {/* Right-hand visual: decoration only, so it's hidden from assistive tech
          and dropped entirely below the tablet breakpoint. */}
      <div className="auth-art" aria-hidden="true">
        <AuthArt />
        <div className="auth-art-veil" />
        <div className="auth-chips">
          <span className="auth-chip"><i /> Equity</span>
          <span className="auth-chip"><i className="is-profit" /> Wins</span>
          <span className="auth-chip"><i className="is-loss" /> Losses</span>
        </div>
        <div className="auth-mark">{BRAND}</div>
      </div>
      <svg className="auth-curve" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M 468 -20 C 604 118 744 244 706 400 C 672 542 540 620 452 720"
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeDasharray="5 9"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <header className="auth-top">
        <a className="auth-logo" href={SITE}>
          <span className="auth-logo-mark" />
          <span>{BRAND}<span className="auth-accent-dot">.</span></span>
        </a>
        <nav className="auth-top-nav">
          <a href={SITE}>Home</a>
          <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Log in' : 'Join'}</Link>
        </nav>
      </header>

      <main className="auth-main">
        <div className="auth-panel">
          <p className="auth-eyebrow">{isSignup ? 'Start for free' : 'Welcome back'}</p>
          <h1 className="auth-title">
            {isSignup ? 'Create new account' : 'Log in to your journal'}
            <span className="auth-accent-dot">.</span>
          </h1>
          <p className="auth-alt">
            {isSignup ? (
              <>Already a member? <Link to="/login">Log in</Link></>
            ) : (
              <>New to {BRAND}? <Link to="/signup">Create an account</Link></>
            )}
          </p>

          <div className="auth-cta">
            <div ref={btnRef} className="auth-gsi" />
            {!ready && !error && <div className="auth-gsi-wait" aria-live="polite">Loading sign-in…</div>}
            <p className="auth-note">
              {BRAND} uses Google sign-in only — no extra password to manage.
              {isSignup && ' Your account is created the first time you sign in.'}
            </p>
          </div>

          {error && <div className="login-error auth-error" role="alert">{error}</div>}

          <ul className="auth-points">
            {POINTS.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      </main>

      <footer className="auth-foot">
        <span>The Operating System for Traders.</span>
        <a href={`${SITE}/privacy`}>Privacy</a>
        <a href={`${SITE}/terms`}>Terms</a>
      </footer>
    </div>
  );
}
