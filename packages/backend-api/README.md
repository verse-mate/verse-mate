# Backend API

This is the backend API SDK of the [backend](../../apps/backend/READMD.md).
It provides functions and utilities to interact with the backend server. This module handles API requests, token management, and response handling. It plays a crucial role in ensuring secure and reliable communication between the frontend and backend.

## Table of Contents

- [Quick Start](#quick-start)
- [Libraries and Dependencies](#libraries-and-dependencies)
- [Repository Structure](#repository-structure)
- [Available Scripts](#available-scripts)
- [Usage](#usage)

## Quick Start

Add the `backend-api` package as a dependency in your project.

```json
"backend-api": "workspace:*"
```

## Libraries and Dependencies

- [@elysiajs/eden](https://elysiajs.com/eden/overview.html): Fully type-safe Elysia client

### Development Dependencies
- [backend](../../apps/backend/READMD.md): The backend application package for importing elysia type.

## Repository Structure

```
|-- backend-api/
|   |-- src/
|       |-- eden.ts  # Defines the API client with token management and response handling.
|       |-- index.ts # Exports the API client.
|-- package.json
|-- README.md        # This file.
```

## Available Scripts

This module don't have scripts

## Usage

```ts
import { api } from "backend-api";

const [response, error] = await safePromise(
  api.user.me.get(),
);

console.log(response?.data?.id)
```
