#!/usr/bin/env bash
# Bring up (or update) the prod monitoring stack — Prometheus + Grafana — as
# Docker containers on the EC2 box, scraping the pm2 backend over loopback.
# Invoked from the deploy pipeline after the app is deployed. Idempotent:
# re-running only recreates containers whose config actually changed, so it's
# safe to run on every deploy.
#
# Reads GRAFANA_PASSWORD from the environment (falls back to "admin").
set -euo pipefail

APP_DIR=/opt/amey-journal
COMPOSE_FILE=docker-compose.monitoring.prod.yml
cd "$APP_DIR"

# First run bootstraps Docker + the compose plugin (Ubuntu). No-op afterwards.
if ! command -v docker >/dev/null 2>&1; then
  echo "[monitoring] Docker not found — installing..."
  sudo apt-get update -y
  sudo apt-get install -y docker.io docker-compose-v2
  sudo systemctl enable --now docker
fi

# Prefer the v2 plugin (`docker compose`); fall back to legacy `docker-compose`.
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "[monitoring] no docker compose available after install" >&2
  exit 1
fi

echo "[monitoring] bringing up stack ($COMPOSE -f $COMPOSE_FILE)..."
# Pass GRAFANA_PASSWORD through sudo (sudo strips the env otherwise). PROMETHEUS_URL
# is set inside the compose file, so it does not need to be exported here.
sudo GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-admin}" \
  $COMPOSE -f "$COMPOSE_FILE" up -d --remove-orphans

sudo $COMPOSE -f "$COMPOSE_FILE" ps
echo "[monitoring] done. Grafana on 127.0.0.1:3001 (SSH-tunnel to reach it)."
