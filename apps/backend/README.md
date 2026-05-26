# Backend

This is the backend of the [application](../../README.md#monorepo-structure).

## Table of Contents

- [Quick Start](#quick-start)
- [Libraries and Dependencies](#libraries-and-dependencies)
- [Repository Structure](#repository-structure)
- [Available Scripts](#available-scripts)

## Quick Start

1. Navigate to the `apps/backend` directory.
2. To run the backend in development mode:

```bash
bun dev
```

3. For testing and creating sample requests to the server, it's recommended to use the [Thunder Client](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client) extension for Visual Studio Code.

## Libraries and Dependencies

- [backend-base](../../packages/backend-base/README.md): Base modules for the backend.
- [Elysia](https://elysiajs.com): A fast and friendly web framework for Bun.
- [@elysiajs/swagger](https://github.com/elysiajs/elysia-swagger): A plugin for Elysia to auto-generate Swagger page

## Repository Structure

```
|-- backend/
|   |-- src/                 # Main source code
|       |-- index.ts             # Elysia API server entry
|       |-- ingest-versions.ts   # Multi-version Bible ingest CLI (bundled to dist/)
```

## Bible ingest in production

The multi-version Bible ingest loader is bundled into the production image
as `dist/ingest-versions.js`, alongside `dist/index.js` and `dist/migrator.js`.
It reads the per-version JSON output of `verse-mate-web`'s
`scripts/bible-ingest/build.py --all` and upserts ~340k verses + localized
book names across all 11 open-licensed translations.

From inside the deployed backend container (e.g. the DO web terminal — the
container's `$POSTGRES_URL` env handles the DB connection automatically):

```bash
# Replace <URL> with a link to a tarball of the build.py output/ tree.
curl -L <URL> -o /tmp/o.tar.gz \
  && mkdir -p /tmp/output \
  && tar -xzf /tmp/o.tar.gz -C /tmp/output \
  && bun ./dist/ingest-versions.js --input /tmp/output
```

Or, if the `output/` tree is already inside the container (via `docker cp`,
a mounted volume, etc.):

```bash
bun ./dist/ingest-versions.js --input /path/to/output [--version KEY]
```

The loader is idempotent — re-running updates existing verse text in place
rather than duplicating rows — so it's safe to retry if interrupted. Pass
`--version KEY` to ingest one version at a time. Implementation lives in
`packages/backend-base/src/bible/ingest-versions.ts`.

## Available Scripts

| Command          | Action                                                                                  |
| :--------------- | :-------------------------------------------------------------------------------------- |
| `bun run build`  | Compiles the project into minified, production-ready JavaScript code optimized for Bun. |
| `bun run dev`    | Starts local dev server at `localhost:3000`.                                            |
| `bun run test`   | Currently, no tests are specified.                                                      |
