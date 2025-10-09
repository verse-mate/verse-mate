FROM oven/bun:1.2.23
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunjs
USER bunjs

COPY --chown=bunjs:bunjs apps/frontend-next/.next/standalone ./
COPY --chown=bunjs:bunjs apps/frontend-next/.next/static ./apps/frontend-next/.next/static
COPY --chown=bunjs:bunjs apps/frontend-next/public ./apps/frontend-next/public

CMD bun --bun run ./apps/frontend-next/server.js
