import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App.jsx';
import { AuthProvider } from './app/AuthContext.jsx';
// Self-hosted fonts (bundled by Vite — no third-party request, no FOUT).
// Geist = UI/body & headings; Geist Mono = prices / R / P&L (tabular) — Geist
// used throughout, per the brand's "one typeface" rule. Inter/JetBrains Mono
// are fallbacks only (kept loaded so the stack degrades gracefully).
/* ONE FAMILY. The Figma redesign sets the entire product in Inter; Geist (the old
   sans), Geist Mono and JetBrains Mono are gone, and with them ~8 woff2 subsets that
   every visitor was downloading for text nobody renders in them. Numerics align via
   `font-variant-numeric: tabular-nums`, not via a monospace face — see tokens.css. */
import '@fontsource-variable/inter';
// Single CSS entry. Import order and the four-layer architecture live in
// styles/index.css - see that file.
import './styles/index.css';

// Frontend error tracking. No-op unless VITE_SENTRY_DSN is set at build time,
// so dev builds (and any build without the var) ship with Sentry inert.
if (import.meta.env.VITE_SENTRY_DSN) {
  // Belt-and-braces against emailed credentials leaving the app. The reset and
  // verify screens already strip `token` from the URL before React commits
  // (features/auth/takeTokenFromUrl.js), so nothing should reach Sentry with one
  // attached — but `sendDefaultPii: false` does NOT redact URLs, and a single
  // sampled event carrying a live single-use token would be an account takeover
  // sitting in a third-party store. Cheap enough to do in both places.
  const scrub = (event) => {
    if (event?.request?.url) event.request.url = event.request.url.replace(/([?&]token=)[^&]*/gi, '$1[redacted]');
    return event;
  };
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrub,
    beforeSendTransaction: scrub,
  });
}

// Catches render-time errors so a component crash shows a message instead of a
// blank page (and reports it to Sentry when configured).
const Fallback = () => (
  <div style={{ padding: 24, fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
    Something went wrong. Please refresh the page.
  </div>
);

createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<Fallback />}>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </Sentry.ErrorBoundary>
);
