# SaaS Starter

## Table of Contents

- [Quick Start](#quick-start)
- [Technologies](#technologies)
- [Libraries and Dependencies](#libraries-and-dependencies)
- [Repository Structure](#repository-structure)
- [Available Scripts](#available-scripts)
- [CICD](#cicd)

## Quick Start

- Install [Bun](https://bun.sh/docs/installation)
- Install packages

```bash
npm install -g bun # the last `npm` command you'll ever need
bun install
```

PS: This `README.md `is related to project structure and main libraries, for more details please check the `README.md` of each package/app for more details.

## Technologies

- [Bun](https://bun.sh/) - Incredibly fast JavaScript runtime, bundler, test runner, and package manager – all in one
- [Elysia](https://elysiajs.com) - Fast, and friendly Bun web framework
- [React](https://react.dev) - The library for web and native user interfaces.
- [TypeScript](https://www.typescriptlang.org) - TypeScript is a superset of JavaScript that compiles to clean JavaScript output.

## Libraries and Dependencies

- [Biome](https://biomejs.dev/) - One toolchain for your web project - Format, lint, and more in a fraction of a second.
- [Stylelint](https://stylelint.io) - CSS linter that helps you avoid errors and enforce conventions.

#### Helper Libraries

- [Concurrently](https://github.com/open-cli-tools/concurrently) - Run multiple commands concurrently.
- [Husky](https://typicode.github.io/husky) - Modern native Git hooks made easy.
- [List-staged](https://github.com/okonet/lint-staged) - Run linters against staged git files.
- [Typed-css-modules](https://github.com/Quramy/typed-css-modules) - Creates TypeScript definition files from CSS Modules .css files.

## Repository Structure

A brief description of how the project is organized, for instance:

- [apps/backend](./apps/backend/README.md) - Elysia application
- [apps/frontend](./apps/frontend/README.md) - Astro application
- [packages/backend-base](./packages/backend-base/README.md) - Backend modules
- [packages/backend-api](./packages/backend-api/README.md) - Backend API SDK
- [packages/database](./packages/database/README.md) - Database modules
- [packages/emails](./packages/emails/README.md) - Email components
- [packages/frontend-base](./packages/frontend-base/README.md) - Frontend components

## Available Scripts

| Command              | Action                                                                                                          |
| :------------------- | :---------------------------------------------------------------------------------------------------------------|
| `bun run format`     | Executes biome format to automatically format all code files within the project directory.                      |
| `bun run lint`       | Runs biome check to perform a linting check on all files within the project directory.                          |
| `bun run lint:watch` | Watches for changes and `lint` the changed file(s) to automatically fix issues if possible.                     |
| `bun run stylelint`  | This script checks CSS files inside the `apps` and `packages` directories.                                      |
| `bun run tsc`        | Runs the TypeScript compiler checker for the whole project.                                                     |

## CI/CD

- Our team utilizes [Drone](https://docs.drone.io/) for Continuous Integration and Continuous Deployment. It's crucial that every application within the `apps` directory has an associated `Dockerfile`. This ensures that the application can be efficiently built and deployed.
