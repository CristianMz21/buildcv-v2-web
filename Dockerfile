# syntax=docker/dockerfile:1

# BuildCv web — the Next.js BFF.
#
# Three stages so the runtime image carries the traced dependency set and nothing else: no pnpm, no
# TypeScript, no source. `output: 'standalone'` in next.config.ts is what makes that possible; without
# it the runtime would need node_modules in full.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --frozen-lockfile so a build cannot quietly resolve a different tree than the one committed.
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build never contacts the API: openapi.json is committed and the types are generated from it, so
# `next build` is hermetic. BUILDCV_API_ORIGIN is a RUNTIME variable and is deliberately absent here.
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# 0.0.0.0 is IPv4 ONLY, and that is deliberate rather than an oversight — see the HEALTHCHECK below,
# which is where the consequence lives. Binding `::` instead would be dual-stack on a default Linux
# kernel and would fail outright to start anywhere IPv6 is switched off, which is a far worse failure
# than the one it fixes and one this project cannot test for.
ENV HOSTNAME=0.0.0.0

# Unprivileged, and it owns nothing it writes to — the app writes nothing at all.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000

# 127.0.0.1, NEVER `localhost`.
#
# Inside this image `localhost` resolves to ::1 and nothing else — `getent hosts localhost` returns
# only the IPv6 address — while the Node server above is bound to IPv4. A probe on `localhost` is
# refused every single time, so the container sits PERMANENTLY UNHEALTHY while serving every real
# request perfectly. That combination is exactly why it survives review: the product works, so the red
# status reads as noise. It is not noise — anything that GATES on health treats it as an app that
# never came up, whether that is an orchestrator deciding where to route traffic or another service
# waiting on `depends_on: condition: service_healthy`, which then waits forever.
#
# The API container does not have this bug because Kestrel binds `http://+:8080`, which is dual-stack.
# Identical-looking healthchecks, opposite outcomes. Found in the deploy compose of the other
# repository, where it had been failing from the first day; shipped here so no future consumer has to
# rediscover it.
#
# --start-period covers first-request compilation on a cold container without counting as failures.
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# No shell form: the process must be PID 1 so a stop signal reaches Node rather than a shell that
# ignores it.
CMD ["node", "server.js"]
