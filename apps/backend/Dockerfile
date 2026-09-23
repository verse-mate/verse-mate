FROM oven/bun:1.2.23
WORKDIR /app

# ffmpeg is for coach session video: frame extraction for the Visual Aids
# dimension (change: port-coach-pipeline, tasks 5.3 and 5.4). Installed in the
# one image both the API and the media worker run from — the worker is the same
# image in a different mode (see the change's deploy runbook), so a separate
# image would be a second thing to build, tag and keep in step.
RUN apt-get update && apt-get install -y curl ffmpeg postgresql-client vim && rm -rf /var/lib/apt/lists/*

# Don't run production as root
RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunjs

# Create Bun cache and temp directories with proper permissions
RUN mkdir -p /home/bunjs/.bun/install/cache && \
    chown -R bunjs:bunjs /home/bunjs && \
    chown -R bunjs:bunjs /app

USER bunjs

COPY --chown=bunjs:bunjs apps/backend/dist ./dist
COPY --chown=bunjs:bunjs packages/database/dist ./dist
COPY --chown=bunjs:bunjs packages/database/migrations ./migrations
COPY --chown=bunjs:bunjs packages/backend-base/src/bible/data/key_english.json /app/dist/data/key_english.json
COPY --chown=bunjs:bunjs packages/backend-base/src/bible/data/NASB1995.json /app/dist/data/NASB1995.json

RUN bun install kysely@0.27.4

EXPOSE 3000

HEALTHCHECK CMD curl -sf http://localhost:${PORT}/health || exit 1

CMD bun run ./dist/migrator.js migrate-deploy && \
    bun --bun run ./dist/index.js
