# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VerseMate is a Bible reading platform with AI-driven translations built as a Bun-based monorepo. It uses Elysia 
for the backend API and Next.js 14 for the frontend.

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
cd apps/backend && bun test  # Backend tests (when implemented)
```

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
/packages
  /backend-api - Eden client SDK for frontend-backend communication
  /backend-base - Core backend modules (auth, bible, chat, queue)
  /database - Kysely ORM models, migrations, seeds
  /emails - React Email components
  /frontend-base - Shared UI components and utilities
  /frontend-envs - Frontend environment configuration
```

### Key Technologies
- **Runtime**: Bun (replaces Node.js, npm, and more)
- **Backend**: Elysia (Bun-native web framework)
- **Frontend**: Next.js 14 with React 18, TypeScript
- **Database**: PostgreSQL with Kysely ORM
- **Queue**: Bull with Redis
- **Auth**: Custom implementation with JWT-like sessions

### API Communication
The frontend communicates with the backend using Eden (type-safe Elysia client). API types are automatically inferred from backend routes.

### Database Operations
- Migrations: `cd packages/database && bun run migrate`
- Seeds: `cd packages/database && bun run seed`
- Schema changes require new migration files in `packages/database/src/migrations/`

### Environment Variables
- Backend: `apps/backend/.env` (copy from `.env.example`)
- Frontend: `apps/frontend-next/.env` (copy from `.env.example`)
- Database: `packages/database/.env` (copy from `.env.example`)

### Code Style
- 2-space indentation
- Biome for formatting and linting
- TypeScript strict mode
- Organized imports (enforced by Biome)

## Important Patterns

### Backend Services
Services in `packages/backend-base/src/services/` follow dependency injection pattern. Each service exports functions that can be composed with database connections.

### Frontend API Calls
Use the Eden client from `packages/backend-api`:
```typescript
import { api } from '@vm/backend-api'
const response = await api.endpoint.method()
```

### Database Queries
Use Kysely query builder from `packages/database`:
```typescript
import { db } from '@vm/database'
const result = await db.selectFrom('users').where('id', '=', userId).selectAll().executeTakeFirst()
```

### Queue Processing
Background jobs use Bull queues in `packages/backend-base/src/queues/`
