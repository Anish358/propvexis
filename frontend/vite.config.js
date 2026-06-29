import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the frontend calls the backend with RELATIVE URLs (VITE_BACKEND_URL
// is empty) so the session cookie is same-origin. These proxies forward
// /api and /socket.io to the backend on :3000 (ws:true for the WebSocket).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
});
