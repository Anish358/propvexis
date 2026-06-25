# Amey Journal — Live Deployment

**Live URL:** https://journal.anishdevlops.xyz

## Infrastructure (AWS account 077045714472, region ap-south-1 / Mumbai)
| Item | Value |
|------|-------|
| EC2 instance | `i-0f6195207bdecdf69` (t3.small, Ubuntu 24.04) |
| Elastic IP | `13.205.66.72` |
| Security group | `amey-journal-sg` (22 ← your IP, 80/443 ← world) |
| SSH key | `~/.ssh/amey-journal.pem` |
| Secrets (token, DB pass) | `~/.ssh/amey-journal-deploy.env` (keep private) |
| DNS | GoDaddy A record `journal` → `13.205.66.72` |
| TLS | Let's Encrypt, auto-managed by Caddy |

## On the server
- App: `/opt/amey-journal` (backend + `frontend/dist`)
- Backend: Node under **pm2** (`pm2 list`, `pm2 logs amey-backend`), listening on `127.0.0.1:3000`
- Web: **Caddy** (`/etc/caddy/Caddyfile`) terminates TLS, serves the UI, proxies `/api/*` + `/socket.io/*`
- DB: local **PostgreSQL 16**, database `amey_journal`, user `amey`

## SSH in
```bash
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72
```

## Common ops
```bash
# logs / restart backend
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72 "pm2 logs amey-backend --lines 50"
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72 "pm2 restart amey-backend"

# re-import the sheet (refresh historical trades)
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72 "cd /opt/amey-journal && node scripts/import-sheet.js"
```

## Redeploy code
```bash
# build UI locally, tar app, scp up, extract, npm i, restart
cd frontend && npm run build && cd ..
tar -czf /tmp/amey-app.tgz package.json src db scripts frontend/dist ea
scp -i ~/.ssh/amey-journal.pem /tmp/amey-app.tgz ubuntu@13.205.66.72:/home/ubuntu/
ssh -i ~/.ssh/amey-journal.pem ubuntu@13.205.66.72 \
  "tar -xzf ~/amey-app.tgz -C /opt/amey-journal && cd /opt/amey-journal && npm install --omit=dev && pm2 restart amey-backend"
```

## EA configuration (on the friend's PC)
- `InpBackendUrl`  = `https://journal.anishdevlops.xyz/api/trades/ingest`
- `InpIngestToken` = (the value in `~/.ssh/amey-journal-deploy.env`)
- Whitelist `https://journal.anishdevlops.xyz` in MT5 → Options → Expert Advisors.

## Cost
~t3.small + 20GB gp3 + Elastic IP ≈ a few USD/month. To pause billing, stop the instance
(keep the EIP associated or you'll lose it). To tear down completely: terminate the
instance, release the EIP, delete the security group + key pair.
