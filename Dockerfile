# syntax=docker/dockerfile:1.7
#
# Froggy — one image, one process: the SPA, the API, both sockets, and the
# Chrome the agent drives.
#
# Build from the repo root; the context has to include the whole workspace so
# bun can resolve `workspace:*`:
#   docker build -t froggy .
#
# The unusual part of this image is the browser. Most Bun services ship on
# `-slim`; this one cannot, because it launches Chromium and Chromium wants
# fonts and a pile of shared libraries. That is the cost of the product being a
# browser you can watch.
#
# It needs no display server. Verified in this image: `Bun.WebView` with the
# Chrome backend brings Chromium up, navigates, and produces screencast frames
# with DISPLAY unset and no Xvfb — so there is deliberately no virtual framebuffer
# here. If that ever stops being true the pane degrades to "No Chrome found" and
# says so, rather than the container failing to start.

# ---- builder ----------------------------------------------------------------
FROM oven/bun:1.4.0 AS builder
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
# feature being switched off, and the reason humanhook's Dockerfile carries the
# same warning.
ARG VITE_PRIVY_APP_ID=""
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID

RUN bun run --filter=@froggy/web build

# ---- runtime ----------------------------------------------------------------
FROM oven/bun:1.4.0 AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Chromium and the fonts it needs to render anything but boxes. `--no-sandbox`
# is applied in `chrome-detect.ts` rather than here, because it is a property of
# running as root in a container without user namespaces, not of this image.
RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

# Chosen explicitly rather than detected. A container that silently fell back to
# a different browser would be the hardest kind of difference to notice.
ENV FROGGY_CHROME=/usr/bin/chromium

# Bun runs TypeScript directly, so there is no server build step. The whole tree
# is copied so `workspace:*` resolution through the root symlinks keeps working.
COPY --from=builder /app /app

# The agent's Chrome profile. Mounted as a volume in production so a redeploy
# does not sign the agent out of everything — which is the product, and also the
# part of it worth thinking hard about.
ENV CHROME_PROFILE_DIR=/data/chrome-profile
ENV STATIC_DIR=/app/apps/web/dist
VOLUME /data

EXPOSE 3001

# Liveness for a local `docker run` only; Railway probes via .railway/railway.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "apps/server/src/index.ts"]
