import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithGoogle } from './api.js';
import { useAuth } from './AuthContext.jsx';
import { BRAND } from './theme.js';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

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

// mode: 'login' (default) or 'signup'. Google sign-in is the same OAuth flow for
// both (a new Google account is created on first use), so this only changes the
// copy + the Google button label. The marketing site deep-links to /signup.
export default function Login({ mode = 'login' }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const btnRef = useRef(null);
  const [error, setError] = useState(null);
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
          width: 280,
        });
      })
      .catch(() => setError('Could not load Google sign-in. Check your connection.'));
    return () => { cancelled = true; };
  }, [navigate, setUser, isSignup]);

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">{BRAND}</div>
        <div className="login-tagline">The Operating System for Traders.</div>
        <div className="login-sub">
          {isSignup ? 'Create your free account' : 'Sign in to your trading journal'}
        </div>
        <div ref={btnRef} className="login-btn" />
        {error && <div className="login-error">{error}</div>}
        <div className="login-alt">
          {isSignup ? (
            <>Already have an account? <a href="/login">Sign in</a></>
          ) : (
            <>New to {BRAND}? <a href="/signup">Create an account</a></>
          )}
        </div>
      </div>
    </div>
  );
}
