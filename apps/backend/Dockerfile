FROM oven/bun:1.2.23
WORKDIR /app

RUN apt-get update && apt-get install -y wget postgresql-client && rm -rf /var/lib/apt/lists/*

# Don't run production as root
RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunjs
USER bunjs

COPY --chown=bunjs:bunjs apps/backend/dist ./dist
COPY --chown=bunjs:bunjs packages/database/dist ./dist
COPY --chown=bunjs:bunjs packages/database/migrations ./migrations
COPY --chown=bunjs:bunjs packages/backend-base/src/bible/data/key_english.json /app/dist/data/key_english.json
COPY --chown=bunjs:bunjs packages/backend-base/src/bible/data/NASB1995.json /app/dist/data/NASB1995.json

EXPOSE 3000

HEALTHCHECK CMD wget --spider -q http://localhost:3000/health || exit 1

CMD bun run ./dist/migrator.js migrate-deploy && \
    bun run ./dist/seeder.js && \
    bun --bun run ./dist/index.js
