# Backend Base

This is the foundational module for the backend of the [application](../../README.md#monorepo-structure). It is designed as a foundational layer, providing necessary configurations and utilities for the main backend module. When extending or customizing backend functionality, this project should be referred to for foundational structures.

## Table of Contents

- [Quick Start](#quick-start)
- [Libraries and Dependencies](#libraries-and-dependencies)
- [Repository Structure](#repository-structure)
- [Available Scripts](#available-scripts)
- [Modules](#modules)

## Quick Start

1. Navigate to the `packages/backend-base` directory.
2. To run the backend-base in test mode:

```bash
bun dev
```

## Libraries and Dependencies

- [Elysia](https://elysiajs.com): A fast and friendly Bun web framework.
- [@elysiajs/jwt](https://elysiajs.com/plugins/jwt): This plugin adds support for using JWT in Elysia handler.
- [@elysiajs/cors](https://elysiajs.com/plugins/cors): This plugin adds support for customizing Cross-Origin Resource Sharing behavior.
- [database](../../packages/database/README.md): Internal workspace link to the database module.
- [dayjs](https://day.js.org/): Day.js is a minimalist JavaScript library that parses, validates, manipulates, and displays dates and times for modern browsers with a largely Moment.js-compatible API.
- [redis](https://github.com/redis/node-redis): node-redis is a modern, high performance Redis client for Node.js.

### Object storage
Object storage uses Bun's built-in S3 client (no external SDK). See
`src/shared/storage/bun-s3.helper.ts` and `storage.service.ts`. Works against
MinIO local and DigitalOcean Spaces production with the same code path
(per Phase 1 decision D-002).

### Development Dependencies

- [@elysiajs/eden](https://elysiajs.com/plugins/eden/overview): Eden is a fetch client for an Elysia server with end-to-end type safety using only TypeScript's type inference instead of code generation. (We use it to create the interface for our tests)
- [@faker-js/faker](https://fakerjs.dev): Generate massive amounts of realistic fake data in Node.js and the browser.

## Repository Structure

```
backend-base/
│
├── src/
│   ├── ...               # Various backend base utilities and configurations
│   └── index.ts          # Entry point of the backend base module
│
└── package.json
```

Elysia looks for configuration and utilities in the `src/` directory, with the primary configuration exposed via `index.ts`.

## Available Scripts

| Command       | Action                        |
| :------------ | :---------------------------- |
| `bun run dev` | Starts bun on test watch mode |

## Modules

By segregating functionalities into dedicated modules, it ensures a cleaner, more maintainable architecture, and better scalability for the backend.

- `auth`: This module encompasses functionalities related to authentication. It provides endpoints for user sign-in, sign-up, password reset, and other authentication-related operations. Additionally, utility helpers for JWT generation, token validation, and other auth mechanisms are incorporated here.

- `shared`: A comprehensive module that houses components essential for multiple parts of the backend. This includes:
  - **Database**: Responsible for all database operations and data storage.
  - **Cache**: Manages caching, session management, and other real-time operations.
  - **Notification**: Facilitates the delivery of notifications like e-mail, push and sms.
  - **Queues**: Handles asynchronous tasks and background processing.
  - **Events**: Manages the propagation and handling of various system events, ensuring efficient inter-module communication.

<!-- TODO: Add more info here -->