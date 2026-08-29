import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App.jsx';
import { AuthProvider } from './app/AuthContext.jsx';
/* SELF-HOSTED, NEVER THE CDN. The Rhea prototype links Geist from
   fonts.googleapis.com; we bundle it through Vite instead — offline-safe, no
   third-party request, no CSP exception. DESIGN-LANGUAGE §3 makes that explicit
   because the prototype is the thing people will copy from.

   TWO FAMILIES, AND THE SECOND ONE IS DATA. Geist is the UI face; Geist Mono is
   every figure — P&L, R multiples, drawdown, times, the clock. Inter was the sole
   family for one day (2026-08-28, on an intermediate Figma pass) and the mono
   token was aliased to it; §22 reverts both. Tabular figures align digits but do
   not give a number the distinct texture that separates data from prose, and this
   app is mostly numbers. */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
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
