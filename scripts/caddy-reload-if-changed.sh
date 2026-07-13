#!/usr/bin/env bash
# Reload Caddy after a deploy ONLY when the version-controlled Grafana site block
# (monitoring/caddy/grafana.caddy) actually changed since the last reload. The
# deploy rsyncs monitoring/ to the box but does not otherwise touch Caddy, so
# without this an edit to grafana.caddy would sit on disk until a manual reload.
#
# Safe no-op when: the snippet isn't present, Caddy isn't installed, or the box's
# Caddyfile doesn't import the snippet (a fresh box still needs the one-time
# import + DNS setup documented in the README — this only automates reloads).
set -euo pipefail

SNIPPET=/opt/amey-journal/monitoring/caddy/grafana.caddy
CADDYFILE=/etc/caddy/Caddyfile
# Hash of the snippet content last applied via reload. Lives outside the repo
# tree's tracked files; the deploy rsync has no --delete, so it persists.
STAMP=/opt/amey-journal/monitoring/caddy/.applied.sha256

[ -f "$SNIPPET" ]                || { echo "[caddy] no Grafana snippet on box; skipping"; exit 0; }
command -v caddy >/dev/null 2>&1 || { echo "[caddy] caddy not installed; skipping"; exit 0; }
grep -q "monitoring/caddy/grafana.caddy" "$CADDYFILE" 2>/dev/null \
  || { echo "[caddy] Caddyfile does not import the Grafana snippet; skipping (do the one-time import first)"; exit 0; }

cur=$(sha256sum "$SNIPPET" | awk '{print $1}')
prev=$(cat "$STAMP" 2>/dev/null || echo "")
if [ "$cur" = "$prev" ]; then
  echo "[caddy] Grafana snippet unchanged; no reload needed"
  exit 0
fi

echo "[caddy] Grafana snippet changed — validating config..."
# Validate the FULL Caddyfile (resolves the import) before touching the running
# server. On failure, set -e aborts here — no reload, stamp not updated, so the
# next deploy retries.
caddy validate --config "$CADDYFILE" --adapter caddyfile
sudo systemctl reload caddy
echo "$cur" > "$STAMP"
echo "[caddy] reloaded and recorded new snippet hash."
