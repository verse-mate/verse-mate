# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VerseMate is a Bible reading platform with AI-driven translations built as a Bun-based monorepo. It uses Elysia for the backend API and Next.js 14 for the frontend.

## Essential Commands

### Initial Setup
```bash
make install  # Sets up Docker, env files, installs dependencies, runs migrations and seeds
```

### Development
```bash
bun dev       # Runs both backend (port 3001) and frontend (port 3000) concurrently
```

### Code Quality
```bash
bun lint      # Run Biome linter
bun format    # Format code with Biome
bun tsc       # TypeScript type checking
bun stylelint # Lint CSS files
```

### Testing
```bash
# IMPORTANT: Backend tests require .env file to be present
cd packages/backend-base && bun test              # Run backend tests (requires .env)
cd packages/backend-base && bun test --coverage   # Run with coverage report

# From root (will fail without proper .env setup)
bun test  # NOT RECOMMENDED - run from packages/backend-base instead
```

**Note**: Backend tests require environment variables (especially `OPEN_AI_KEY` for OpenAI client initialization). Always run tests from `packages/backend-base/` directory where the `.env` file is located.

### Building
```bash
cd apps/backend && bun build        # Build backend
cd apps/frontend-next && bun build  # Build frontend
```

## Architecture

### Monorepo Structure
```
/apps
  /backend - Elysia API server (port 3001)
  /frontend-next - Next.js app (port 3000)
  /website - Marketing website
/packages
  /backend-api - Eden client SDK for frontend-backend communication
  /backend-base - Core backend modules (auth, bible, chat, queue, workers)
  /database - Kysely ORM models, migrations, seeds
  /emails - React Email components
  /frontend-base - Shared UI components and utilities
  /frontend-envs - Frontend environment configuration
```

### Key Technologies
- **Runtime**: Bun (replaces Node.js, npm, and more)
- **Backend**: Elysia (Bun-native web framework) with plugin architecture
- **Frontend**: Next.js 14 with React 18, TypeScript
- **Database**: PostgreSQL with Kysely ORM
- **Queue**: BullMQ with Redis for background job processing
- **Auth**: Custom implementation with bearer token sessions
- **API Client**: Eden Treaty for type-safe client-server communication
- **AI**: OpenAI GPT-5 Nano for Bible explanations and chat
- **CI/CD**: Drone CI for automated testing and deployment

### API Communication
The frontend communicates with the backend using Eden Treaty (type-safe Elysia client). The backend exports route types from plugins (authPlugin, biblePlugin, userPlugin, adminPlugin) which are composed in `apps/backend/src/index.ts` and exposed to the frontend through the `backend-api` package. API types are automatically inferred, providing end-to-end type safety.

### Database Operations
- **Deploy migrations**: `cd packages/database && bun run migrate:deploy` (or `bun migrate:deploy`)
- **Dev migrations**: `cd packages/database && bun run migrate:dev` (create new migration)
- **Rollback**: `cd packages/database && bun run migrate:down`
- **Seed database**: `cd packages/database && bun run db:seed` (or `bun db:seed`)
- **Generate models**: `cd packages/database && bun run model:generate` (generates Kysely types from schema)
- **Generate DBML**: `cd packages/database && bun run dbml:generate` (Prisma-based schema visualization)
- Schema changes require new migration files in `packages/database/src/migrations/`

### Environment Variables
- Backend: `apps/backend/.env` (copy from `.env.example`)
- Backend Base: `packages/backend-base/.env` (copy from `.env.example`)
- Frontend: `apps/frontend-next/.env` (copy from `.env.example`)
- Database: `packages/database/.env` (copy from `.env.example`)
- Required services: PostgreSQL and Redis (configured in `docker-compose.yml`)

### Code Style
- 2-space indentation
- Biome for formatting and linting
- TypeScript strict mode
- Organized imports (enforced by Biome)

## Important Patterns

### Backend Plugin Architecture
The backend uses Elysia's plugin system to modularize functionality:
- Plugins are in `packages/backend-base/src/*/` (auth, bible, user, admin)
- Each plugin defines routes, state management, and dependencies
- Plugins are composed in `apps/backend/src/index.ts`
- Example: `authPlugin`, `biblePlugin`, `userPlugin`, `adminPlugin`

### Backend Services and Repositories
- **Services** (`packages/backend-base/src/*/services/`): Business logic layer
- **Repositories** (`packages/backend-base/src/*/repository/`): Data access layer
- Services depend on repositories and are injected into plugin state
- Example: `BibleService` uses `BibleRepository` for database operations

### Frontend API Calls
Use the Eden Treaty client from `packages/backend-api`:
```typescript
import { api } from '@vm/backend-api'
const { data } = await api.bible.books.get()
```
The client automatically includes bearer token authentication from cookies.

### Database Queries
Use Kysely query builder from `packages/database`:
```typescript
import { db } from '@vm/database'
const result = await db.selectFrom('users').where('id', '=', userId).selectAll().executeTakeFirst()
```

### Background Jobs and Queues
- Queues are defined in `packages/backend-base/src/queue/`
- Workers are in `packages/backend-base/src/workers/`
- Uses BullMQ with Redis for job processing
- Example: `batch-processing.queue.ts` and `batch-processing.worker.ts`

## Docker and Local Development

### Docker Services
The project uses Docker Compose for local infrastructure:
- **PostgreSQL** (port 5432): Main database
- **Redis** (port 6379): Queue backend and caching
- **Prisma Studio** (port 5555): Database GUI tool

Start services: `docker compose up -d` (or use `make install` for full setup)

### CI/CD Pipeline
Drone CI (`.drone.yml`) runs on push to `main` or `develop`:
1. Install dependencies and compile
2. Run TypeScript checks, Biome linting, and Stylelint
3. Run tests with temporary PostgreSQL and Redis
4. Build frontend and backend
5. Build and push Docker images
6. Deploy to production server via SSH
