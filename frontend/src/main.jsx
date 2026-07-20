import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
// Self-hosted fonts (bundled by Vite — no third-party request, no FOUT).
// Geist = UI/body & headings (Linear/Vercel-family grotesque); Geist Mono =
// prices / R / P&L (tabular). Inter kept as the sans fallback.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/inter';
import './styles.css';

// Frontend error tracking. No-op unless VITE_SENTRY_DSN is set at build time,
// so dev builds (and any build without the var) ship with Sentry inert.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

// Catches render-time errors so a component crash shows a message instead of a
// blank page (and reports it to Sentry when configured).
const Fallback = () => (
  <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
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
