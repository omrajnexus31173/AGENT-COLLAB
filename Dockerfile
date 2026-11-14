FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build without secrets. Runtime configuration is injected by the operator.
ENV NEXUS_DISABLE_WORKER=true
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 nexus && useradd --system --uid 1001 --gid nexus nexus
COPY --from=builder --chown=nexus:nexus /app/.next/standalone ./
COPY --from=builder --chown=nexus:nexus /app/.next/static ./.next/static
COPY --from=builder --chown=nexus:nexus /app/public ./public
COPY --from=builder --chown=nexus:nexus /app/migrations ./migrations
USER nexus
EXPOSE 3000
CMD ["node", "server.js"]
