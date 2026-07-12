# syntax=docker/dockerfile:1

# ---- deps: install production dependencies only ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
FROM node:20-alpine AS runtime
# tini = proper PID 1: forwards signals (graceful shutdown) and reaps zombies.
# Not pinning apk versions: tini is a tiny, stable init; pinning causes churn.
# hadolint ignore=DL3018
RUN apk add --no-cache tini
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

# Run as an unprivileged user.
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY db ./db
COPY scripts ./scripts
COPY ea ./ea

USER app
EXPOSE 3000

# Container-level liveness: hit /health (which also checks the DB).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
