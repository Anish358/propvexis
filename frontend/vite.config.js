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
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
});
