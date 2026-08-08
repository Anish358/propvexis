import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev the frontend calls the backend with RELATIVE URLs (VITE_BACKEND_URL
// is empty) so the session cookie is same-origin. These proxies forward
// /api and /socket.io to the backend on :3000 (ws:true for the WebSocket).
export default defineConfig({
  // tailwindcss() is the official Vite plugin (Tailwind v4). It replaces the old
  // PostCSS + tailwind.config.js setup entirely — v4 is configured in CSS, so
  // there is no tailwind.config.js to add. See src/tailwind.css.
  plugins: [react(), tailwindcss()],
  // '@' → src/. Required by shadcn: generated components import each other and
  // the cn() helper as '@/components/ui/...' and '@/lib/utils'. Must stay in
  // sync with jsconfig.json, which is what the CLI and the editor read.
  // fileURLToPath(new URL(...)) rather than __dirname — this config is ESM.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // The app was shipping as a single ~1.3 MB chunk, which meant every deploy
  // invalidated the whole bundle and Vite warned on every build. The charting
  // libraries are the bulk of it and they change far less often than app code,
  // so they get their own long-lived chunks. recharts and lightweight-charts
  // stay SEPARATE deliberately — together they exceed the 500 kB warning again.
  build: {
    rollupOptions: {
      // Importing a name a dependency does not export is a WARNING in Rollup, not
      // an error: the build prints one line, exits 0, and ships the binding as
      // `undefined`. Rendering `<undefined>` then blanks the page behind the error
      // boundary. That is the exact failure mode a major-version bump of a
      // component library produces, so it is promoted to a build failure here —
      // verified by importing a non-existent react-router export and watching the
      // build go from "✓ built" to a hard stop.
      onwarn(warning, defaultHandler) {
        if (warning.code === 'MISSING_EXPORT') {
          throw new Error(`${warning.message}\n  (promoted from a warning — see rollupOptions.onwarn)`);
        }
        defaultHandler(warning);
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
          'lightweight-charts': ['lightweight-charts'],
          sentry: ['@sentry/react'],
          socketio: ['socket.io-client'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
});
