# syntax=docker/dockerfile:1.7
#
# Froggy — one image, one process: the SPA, the API and both sockets.
#
# Build from the repo root; the context has to include the whole workspace so
# bun can resolve `workspace:*`:
#   docker build -t froggy .
#
# There is deliberately no browser in this image. The Chrome the agent drives is
# a Browser Use hosted browser, reached over CDP, so this container ships no
# Chromium, no fonts for it to render with, and no profile directory — and the
# process that holds the Privy secret and the Hedera key is no longer the
# process that renders hostile pages.

# ---- builder ----------------------------------------------------------------
FROM oven/bun:1.4.2 AS builder
WORKDIR /app

# Manifests and the lockfile first, so the install layer survives source edits.
# Every workspace member's package.json must be here or `--frozen-lockfile`
# resolution fails.
COPY package.json bun.lock bunfig.toml turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/browser/package.json ./packages/browser/
COPY packages/database/package.json ./packages/database/
COPY packages/domain/package.json ./packages/domain/
COPY packages/graph/package.json ./packages/graph/
COPY packages/payments/package.json ./packages/payments/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/ui/package.json ./packages/ui/
COPY packages/wallet/package.json ./packages/wallet/

RUN bun install --frozen-lockfile --no-summary

COPY apps ./apps
COPY packages ./packages

# Vite inlines these at BUILD time. A variable set on the Railway service but not
# declared here never reaches the bundle — a failure that looks exactly like the
# feature being switched off.
ARG VITE_PRIVY_APP_ID=""
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID

RUN bun run --filter=@froggy/web build

# ---- runtime ----------------------------------------------------------------
FROM oven/bun:1.4.2 AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Bun runs TypeScript directly, so there is no server build step. The whole tree
# is copied so `workspace:*` resolution through the root symlinks keeps working.
COPY --from=builder /app /app

# The agent's logins live in a Browser Use profile per user, not on a disk here,
# so a redeploy no longer signs the agent out of everything and this image needs
# no volume. `.railway/railway.ts` still declares the old `browser-profile`
# volume; see the note there.
ENV STATIC_DIR=/app/apps/web/dist

EXPOSE 3001

# Liveness for a local `docker run` only; Railway probes via .railway/railway.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "apps/server/src/index.ts"]
