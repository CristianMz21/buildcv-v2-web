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
ENV HOSTNAME=0.0.0.0

# Unprivileged, and it owns nothing it writes to — the app writes nothing at all.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000

# No shell form: the process must be PID 1 so a stop signal reaches Node rather than a shell that
# ignores it.
CMD ["node", "server.js"]
