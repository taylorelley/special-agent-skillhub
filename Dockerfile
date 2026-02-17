# Stage 1: Install dependencies
FROM oven/bun:1.3.6-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/schema/package.json packages/schema/
COPY packages/skillhub/package.json packages/skillhub/

RUN bun install --frozen-lockfile

# Stage 2: Build the application
FROM oven/bun:1.3.6-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/schema/node_modules ./packages/schema/node_modules
COPY --from=deps /app/packages/skillhub/node_modules ./packages/skillhub/node_modules

COPY . .

# Vite inlines VITE_* variables at build time — pass these as build args in Coolify
ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ARG VITE_SOULHUB_SITE_URL
ARG VITE_SOULHUB_HOST
ARG VITE_SITE_MODE
ARG VITE_SITE_URL

RUN bun --bun run build

# Stage 3: Production runtime
FROM oven/bun:1.3.6-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nitro

# Copy the Nitro server output
COPY --from=builder /app/.output .output

# OG image handler reads these files from the filesystem at runtime (server/og/ogAssets.ts)
COPY --from=builder /app/public/skillhub-mark.png ./public/skillhub-mark.png
COPY --from=builder /app/node_modules/@resvg/resvg-wasm/index_bg.wasm ./node_modules/@resvg/resvg-wasm/index_bg.wasm
COPY --from=builder /app/node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2 ./node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2
COPY --from=builder /app/node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-500-normal.woff2 ./node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-500-normal.woff2
COPY --from=builder /app/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2 ./node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2

USER nitro

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["bun", "run", ".output/server/index.mjs"]
