// What the dev proxy says when it cannot reach the backend.
//
// Vite proxies /api to :3000. When nothing is listening there the proxy — not
// our API — manufactures a 502 with an opaque body, and the UI renders it as
// `Sign-in failed: login 502`. That reads as an authentication bug and sends
// you into src/platform/auth/, which is the wrong place entirely; it is
// recorded as a trap in the auto-memory for exactly that reason, having cost
// the time twice.
//
// The fix goes HERE, at the one place the 502 is invented, rather than at the
// ~35 call sites in lib/api.js that turn a status into a string. Most of those
// are already written as `msg.error || <fallback>`, so giving the proxy's reply
// a JSON `error` field means every one of them prints the real cause for free
// and none of them has to change.
//
// Dev only. In prod Caddy fronts the API and pm2 keeps it alive.

/** Human-readable cause for a proxy failure. `code` is a Node errno string. */
export function proxyErrorMessage(err) {
  const code = err?.code ?? '';
  if (code === 'ECONNREFUSED') {
    // By far the common case, and the one worth spelling out completely:
    // whoever hits it is looking at a browser, not at a terminal.
    return 'The backend is not running on :3000. Start it with `npm run dev` in the repo root.';
  }
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    // Almost always the supervisor restarting the server underneath an
    // in-flight request. Distinguished from the above because the answer is
    // "try again", not "go start something".
    return 'The backend closed the connection mid-request — it is probably restarting. Try again.';
  }
  if (code === 'ETIMEDOUT') {
    return 'The backend on :3000 did not respond in time.';
  }
  return `Cannot reach the backend on :3000 (${code || err?.message || 'unknown error'}).`;
}

/* Attach to a Vite proxy entry via `configure`. Kept separate from the message
 * so the wording is testable without standing up a proxy. */
export function attachProxyErrorHandler(proxy) {
  proxy.on('error', (err, _req, res) => {
    /* `res` is a bare Socket for a WebSocket upgrade, not a ServerResponse —
       writeHead does not exist there and calling it would replace a readable
       proxy error with a TypeError inside Vite. */
    if (!res || typeof res.writeHead !== 'function' || res.headersSent) return;
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: proxyErrorMessage(err) }));
  });
}
