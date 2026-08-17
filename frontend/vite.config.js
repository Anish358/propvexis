import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vendor chunking, package name -> chunk. Each entry lists the package itself
// AND the private dependencies that used to ride along with it under Rollup's
// object form of manualChunks (see the note at the call site). Keeping recharts
// and lightweight-charts in SEPARATE chunks is deliberate: combined they cross
// Vite's 500 kB warning.
const VENDOR_CHUNKS = [
  ['react', new Set(['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'])],
  ['recharts', new Set([
    'recharts', 'react-smooth', 'react-transition-group', 'victory-vendor',
    'decimal.js-light', 'fast-equals', 'eventemitter3', 'es-toolkit',
    'd3-array', 'd3-color', 'd3-format', 'd3-interpolate', 'd3-path',
    'd3-scale', 'd3-shape', 'd3-time', 'd3-time-format', 'internmap',
  ])],
  ['lightweight-charts', new Set(['lightweight-charts', 'fancy-canvas'])],
  ['sentry', new Set(['@sentry/react', '@sentry/browser', '@sentry/core'])],
  ['socketio', new Set([
    'socket.io-client', 'socket.io-parser', 'engine.io-client', 'engine.io-parser',
    'ws', 'xmlhttprequest-ssl',
  ])],
];

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
        // FUNCTION FORM, not the object form Rollup accepted. Vite 8 bundles with
        // Rolldown, which rejects `manualChunks: { name: [pkgs] }` outright —
        // "Invalid type: Expected Function but received Object", a hard build
        // failure rather than a silent behaviour change, which is the good case.
        //
        // The object form assigned a package AND everything reachable only from it
        // to the chunk. A function keyed on the package name does not, so a
        // library's private dependencies would fall back into the app chunk —
        // recharts alone drags in d3-*, victory-vendor and react-smooth. Those are
        // listed explicitly below to keep the split where it was; the assertion
        // that this worked is the chunk sizes, which are unchanged.
        manualChunks(id) {
          const path = id.replace(/\\/g, '/');
          const m = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
          if (!m) return undefined;
          const pkg = m[1];
          for (const [chunk, packages] of VENDOR_CHUNKS) {
            if (packages.has(pkg)) return chunk;
          }
          return undefined;
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
