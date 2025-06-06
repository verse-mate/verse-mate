# Database

This is the database module of the [application](../../README.md#monorepo-structure). It Manages the structure, setup, and evolution of the database schema. Using scripts, it ensures consistent data structures across different development and production environments. This module is critical for evolving the database in a controlled and versioned manner.

## Table of Contents

- [Quick Start](#quick-start)
- [Libraries and Dependencies](#libraries-and-dependencies)
- [Repository Structure](#repository-structure)
- [Available Scripts](#available-scripts)
- [Modules](#modules)
- [Usage](#usage)

## Quick Start

1. Navigate to the `packages/database` directory.
2. To create a new database migration:

```bash
bun run migrate:dev
```

## Libraries and Dependencies

- [kysely](https://kysely.dev): A type-safe, SQL-first database query builder for TypeScript.
- [pg](https://node-postgres.com): Non-blocking PostgreSQL client for Node.js. Includes pure JavaScript and native libpq bindings.

### Development Dependencies
- [Kanel](https://kristiandupont.github.io/kanel/): Generate TypeScript typings from a Postgres database.

## Repository Structure

```
|-- database/
|   |-- migrations/ # all migrations developed so far
|   |-- src/
|       |-- actions/       # Migration actions
|       |   |-- migrate-deploy.ts
|       |   |-- migrate-dev.ts
|       |   |-- migrate-down.ts
|       |-- models/ # Generated database entity typings
|       |-- database.ts       # Entry point of the module
|       |-- seeder.ts         # Database population script
```

## Available Scripts

| Command                  | Action                                                       |
| :----------------------- | :----------------------------------------------------------- |
| `bun run migrate:deploy` | Deploy your pending migrations to your database.             |
| `bun run migrate:dev`    | Create a migration empty migration.                          |
| `bun run migrate:down`   | Reverts the most recent migration changes from the database. |
| `bun run model:generate` | Generate or update database entity typings.                  |
| `bun run db:seed`        | Populates the database with essential initial data.          |

### Modules

#### General Philosophy

- TODO: We'll probably follow the same as `backend-base` and `frontend-base`, having a folder for each feature.

## Usage

- This is still in definition, we have a bare-bones database.ts and types.ts. We should define the best process for creating the database types soon. You can check at [Kysely-Docs](https://kysely.dev/docs/generating-types) for more details.

### Conventions

The tables should be renamed in camelCase format and in the singular (with exceptions for pluralized words, for example: 'campus', 'settings', etc), and the columns should also be renamed in camelCase format.
This convention was chosen because we don't use an ORM, so the naming should facilitate the conversion of the relational object, as well as avoid issues with code generation.
