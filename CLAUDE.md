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
bun dev       # Runs both backend (port 4000) and frontend (port 3000) concurrently
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
  /backend - Elysia API server (port 4000)
  /frontend-next - Next.js app (port 3000) — the logged-in PWA at app.versemate.org
  /website - Marketing website (port 3002) — the public site at versemate.org
/packages
  /backend-api - Eden client SDK for frontend-backend communication
  /backend-base - Core backend modules (auth, bible, chat, queue, workers)
  /database - Kysely ORM models, migrations, seeds
  /emails - React Email components
  /frontend-base - Shared UI components and utilities
  /frontend-envs - Frontend environment configuration
```

### Where to put marketing / external website changes

**All public-facing marketing pages go in `apps/website`, not `apps/frontend-next`.**

- `apps/website` → `versemate.org` (marketing, landing pages, `/give`, `/about`, `/coach`, `/privacy`, etc.). Next.js with `output: "export"`, static export served by a Cloudflare Worker. Drop new static HTML into `apps/website/public/<route>/index.html` or add a page in `apps/website/src/pages/`.
- `apps/frontend-next` → **`admin.versemate.org` (admin-only — staff content management).** Per [versemate-meta constitution CONST-002 "mobile-first"](../versemate-meta/constitution.md), the canonical user-facing surface is `verse-mate-mobile` (iOS, Android, web export). frontend-next is no longer a user product. New user-facing features go in mobile, NOT here.

  Allowed in `apps/frontend-next`:
  - `(admin)/admin` — admin dashboard, content management, prompts editor, batch ops
  - `(auth)` — admin login + SSO callbacks (admins authenticate here)
  - `(bible)` — read-only Bible preview for admin QA (per spec [feat-admin-bible-preview](../versemate-meta/specs/feat-admin-bible-preview/spec.md))
  - `topic/[category]/[slug]` — read-only topic preview for admin QA

  **NOT allowed in `apps/frontend-next`** (deprecated, removal pending):
  - User signup flows (mobile owns signup; admin gets `is_admin = true` via manual SQL per D-014 in feat-auth-platform)
  - Chat / Q&A UI (Q&A feature removed entirely per D-009)
  - User input bars / Bible reader composing tools
  - Anything wrapped by `useChat`, `useConversationManager`, `useInput`, `Chat`, `ConversationHistory`, `InputBar`

If you're unsure, the rule is: "Would this URL make sense on versemate.org?" If yes → `apps/website`. "Would a user (not admin) need this?" If yes → mobile, not frontend-next.

### Key Technologies
- **Runtime**: Bun (replaces Node.js, npm, and more)
- **Backend**: Elysia (Bun-native web framework) with plugin architecture
- **Frontend**: Next.js 14 with React 18, TypeScript
- **Database**: PostgreSQL with Kysely ORM
- **Queue**: BullMQ with Valkey for background job processing
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
- Required services: PostgreSQL and Valkey (configured in `docker-compose.yml`)

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
- Uses BullMQ with Valkey for job processing
- Example: `batch-processing.queue.ts` and `batch-processing.worker.ts`

### Frontend state — nanostores
We don't use `@nanostores/react`. Subscribe to atoms via the local
helper:

```ts
import { useStore } from '../utils/use-store'
```

The helper is in `packages/frontend-base/src/utils/use-store.ts` and
mirrors `@nanostores/react`'s API via `useSyncExternalStore`.

### useEffect deps on nullable objects
Biome's react-hooks rule rejects `[obj?.field]` as "more specific than
its captures". Two options:

```ts
// Option A: depend on the object; effect re-runs on identity change.
useEffect(() => { ... }, [track, otherDep]);

// Option B: memoize the derived value above the effect.
const explanationId = track?.explanation_id;
useEffect(() => { ... }, [explanationId, otherDep]);
```

Don't reach for `// biome-ignore` — the lint rule catches a real
staleness class of bug.

## Docker and Local Development

### Docker Services
The project uses Docker Compose for local infrastructure:
- **PostgreSQL** (port 5432): Main database
- **Valkey** (port 6379): Queue backend and caching (Redis-compatible)
- **Prisma Studio** (port 5555): Database GUI tool

Start services: `docker compose up -d` (or use `make install` for full setup)

**Before starting services from a fresh clone or new workspace path:** the compose file uses fixed container names (`postgres`, `redis`, `minio`) with bind mounts to the *repo path that first started them*. If a prior workspace path still has those containers running, `docker compose up -d` silently no-ops while Postgres reads the wrong data dir — and an unclean shutdown can corrupt the volume. Run the cleanup ritual:

```sh
docker rm -f postgres redis minio prisma-studio minio-setup 2>/dev/null
docker compose up -d
```

Cheap pre-flight: `bun scripts/check-docker-paths.ts`. Full background and Postgres-corruption recovery: see `repos/versemate-meta/CLAUDE.md` → "Stale container cleanup (macOS bind-mount trap)".

### CI/CD Pipeline
GitHub Actions (`.github/workflows/`) runs on push to `main` or version tags:
1. Install dependencies and compile
2. Run TypeScript checks, Biome linting, and Stylelint
3. Run tests with temporary PostgreSQL and Valkey
4. Build frontend and backend
5. Build and push Docker images
6. Deploy to production server via SSH
