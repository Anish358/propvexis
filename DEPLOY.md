# Amey Journal — Deployment Runbook (single AWS Linux box, Mumbai)

Target architecture (finalized):

```
[Friend's PC: MT5 + AmeyJournal EA]  ──HTTPS POST──┐
                                                    ▼
   ap-south-1 (Mumbai)  ┌───────────────────────────────────────┐
                        │  1× EC2 Ubuntu  (t3.small)             │
                        │   Caddy (TLS) ─► Node backend :3000    │
                        │                 └► Postgres            │
                        │   Caddy ─► built React UI (dist/)      │
                        └───────────────────────────────────────┘
                                    ▲ HTTPS + WebSocket
                          Friend's browser  →  journal.<your-domain>
```

No Windows VPS — the EA runs on the friend's own machine (he's a day trader;
offline closes are backfilled on EA startup).

> ⚠️ Confirm the real domain first. You mentioned both `anishdevlops.xyz` and
> `anishdevlops.xyz` — pick the registered one and use it everywhere below as
> `journal.<your-domain>`.

---

## 1. Launch the instance
- EC2 **Ubuntu 24.04 LTS**, **t3.small**, region **ap-south-1 (Mumbai)**.
- Allocate an **Elastic IP**, associate it.
- Security group inbound:
  - `22` (SSH) — **your IP only**
  - `80`, `443` — `0.0.0.0/0` (Caddy + TLS)
  - Postgres `5432` — **not exposed** (local only).

## 2. DNS
- Add an **A record**: `journal.<your-domain>` → the Elastic IP.

## 3. Install runtime (on the box)
```bash
sudo apt update
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql git
sudo npm i -g pm2
# Caddy (auto-HTTPS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 4. Database
```bash
sudo -u postgres psql -c "CREATE USER amey WITH PASSWORD 'CHANGE_ME_STRONG';"
sudo -u postgres psql -c "CREATE DATABASE amey_journal OWNER amey;"
```

## 5. Backend
```bash
git clone <your-repo> /opt/amey-journal   # or scp the project up
cd /opt/amey-journal
npm install --omit=dev
cat > .env <<'EOF'
PORT=3000
HOST=127.0.0.1
DATABASE_URL=postgres://amey:CHANGE_ME_STRONG@127.0.0.1:5432/amey_journal
INGEST_TOKEN=GENERATE_A_LONG_RANDOM_TOKEN
CORS_ORIGIN=https://journal.<your-domain>
EOF
node scripts/setup-db.js
psql "$DATABASE_URL" -f db/migrations/0001_add_symbol_base.sql   # apply migrations
pm2 start src/server.js --name amey-backend
pm2 save && pm2 startup    # auto-start on reboot (run the printed command)
```
Generate a token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 6. Frontend (build + let Caddy serve it)
```bash
cd /opt/amey-journal/frontend
echo "VITE_BACKEND_URL=https://journal.<your-domain>" > .env.local
npm install && npm run build      # outputs dist/
```

## 7. Caddy (TLS + reverse proxy + SPA)
`/etc/caddy/Caddyfile`:
```
journal.<your-domain> {
    encode gzip
    @backend path /api/* /socket.io/*
    handle @backend {
        reverse_proxy 127.0.0.1:3000
    }
    handle {
        root * /opt/amey-journal/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```
```bash
sudo systemctl reload caddy
```
Caddy fetches a Let's Encrypt cert automatically and proxies WebSockets out of the box.

## 8. Point the EA at it (on the friend's PC)
- MT5 → **Tools → Options → Expert Advisors → Allow WebRequest for listed URL** →
  add `https://journal.<your-domain>`.
- EA inputs: `InpBackendUrl = https://journal.<your-domain>/api/trades/ingest`,
  `InpIngestToken =` the token from step 5.
- Attach to one chart, enable Algo Trading.

## 9. Validate (demo account first)
- Confirm `https://journal.<your-domain>` loads.
- Open + close a micro trade on his demo → it appears live and flashes.
- Reconcile SL pips / MFE / Max R / Fixed R / session / P&L against MT5.
- Restart his terminal → confirm backfill catches any close made while it was off.

## Notes
- Ingest is public but **token-protected + HTTPS**. Keep the token secret.
- For more durability later: move Postgres to **RDS**, add nightly `pg_dump` to S3.
- Cost: ~t3.small + EBS + Elastic IP (a few $/mo). No Windows licensing.
