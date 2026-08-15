import React from 'react';
import { BRAND } from '../../lib/theme.js';
import AuthArt from './AuthArt.jsx';
import Logo from '../../components/Logo.jsx';

// The split-screen chrome shared by every logged-out screen: login, signup,
// forgot password, choose a new password, confirm your email.
//
// Extracted when the second such screen appeared. It is chrome only — each
// screen owns its own form and its own copy — so that "the logged-out pages all
// look like one product" is a fact about the code rather than a thing to
// re-check whenever one of them changes.

// Where the wordmark points. On the deployed app that's the marketing site; on
// a dev box there is no local marketing site, and being thrown out to
// production mid-test is worse than a no-op — so stay on this origin.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', ''];
const isLocal = typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname);
export const SITE = isLocal ? '/' : 'https://propvexis.com';

/**
 * @param {object}          props
 * @param {string}          props.eyebrow  small line above the heading
 * @param {React.ReactNode} props.title    heading; the accent dot is added here
 * @param {React.ReactNode} [props.alt]    the "already a member?" line
 * @param {React.ReactNode} [props.note]   small print under the panel
 * @param {React.ReactNode} props.children the screen's own content
 */
export default function AuthShell({ eyebrow, title, alt, note, children }) {
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
        <a className="auth-logo" href={SITE} aria-label={`${BRAND} home`}>
          <Logo size={22} />
          <span>{BRAND}<span className="auth-accent-dot">.</span></span>
        </a>
      </header>

      <main className="auth-main">
        <div className="auth-panel">
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1 className="auth-title">
            {title}
            <span className="auth-accent-dot">.</span>
          </h1>
          {alt && <p className="auth-alt">{alt}</p>}
          {children}
          {note && <p className="auth-note">{note}</p>}
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
