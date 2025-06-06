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
|       |-- index.ts         # Entry point of the application
```

## Available Scripts

| Command          | Action                                                                                  |
| :--------------- | :-------------------------------------------------------------------------------------- |
| `bun run build`  | Compiles the project into minified, production-ready JavaScript code optimized for Bun. |
| `bun run dev`    | Starts local dev server at `localhost:3000`.                                            |
| `bun run test`   | Currently, no tests are specified.                                                      |
