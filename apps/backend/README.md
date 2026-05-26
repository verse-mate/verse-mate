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

After a deploy, the multi-version Bible ingest loader can be run from inside
the backend container. It is bundled into the production image as
`dist/ingest-versions.js`:

```bash
# Inside the running backend container, with $POSTGRES_URL already set:
bun ./dist/ingest-versions.js --input /path/to/output [--version KEY]
```

The `--input` directory must follow the layout produced by `verse-mate-web`'s
`scripts/bible-ingest/build.py --all` (per-version `manifest.json` + per-book
`<bookId>/<chapter>.json` files). Place that directory inside the container
first — for example with `docker cp`, a mounted volume, or by downloading a
tarball — since the loader reads from the local filesystem and does not
fetch the data itself.

The loader is idempotent: re-running updates existing verse text in place
rather than duplicating rows. Use `--version KEY` to ingest one version at a
time. Implementation lives in
`packages/backend-base/src/bible/ingest-versions.ts`.

## Available Scripts

| Command          | Action                                                                                  |
| :--------------- | :-------------------------------------------------------------------------------------- |
| `bun run build`  | Compiles the project into minified, production-ready JavaScript code optimized for Bun. |
| `bun run dev`    | Starts local dev server at `localhost:3000`.                                            |
| `bun run test`   | Currently, no tests are specified.                                                      |
