# Technical Stack

> Last Updated: 2025-01-19
> Version: 1.0.0

## Application Framework

- **Framework:** Elysia
- **Version:** 1.1.4
- **Runtime:** Bun 1.2.19

## Database

- **Primary Database:** PostgreSQL
- **ORM:** Kysely
- **Migrations:** Custom migration system via Kysely

## JavaScript

- **Framework:** Next.js 15 with React 18
- **Language:** TypeScript (strict mode)
- **Package Manager:** Bun workspaces

## CSS Framework

- **Framework:** CSS Modules with PostCSS
- **Styling Strategy:** Component-scoped CSS modules

## UI Component Library

- **Library:** Custom components with forwardRef pattern
- **Component Architecture:** Shared components in frontend-base package

## Fonts Provider

- **Provider:** System fonts with web font fallbacks

## Icon Library

- **Library:** Custom SVG icons

## Application Hosting

- **Frontend:** Cloudflare Workers
- **Backend:** Custom deployment

## Database Hosting

- **Service:** PostgreSQL (production environment TBD)

## Asset Hosting

- **Service:** Integrated with application hosting

## Deployment Solution

- **Frontend:** Cloudflare Workers deployment
- **Backend:** Custom backend deployment
- **Development:** Docker Compose for local services

## Code Repository

- **Platform:** Git-based version control
- **Architecture:** Monorepo with Bun workspaces

## Additional Technologies

### Queue System
- **Framework:** BullMQ
- **Backend:** Redis
- **Purpose:** Background job processing for AI operations

### Authentication
- **System:** Custom JWT-like session management
- **Session Duration:** 7-day sessions
- **Security:** Token-based authentication

### AI Integration
- **Provider:** OpenAI
- **Services:** Multi-format explanations (summary, detailed, verse-by-verse), Q&A responses
- **Processing:** Background queue processing for explanation generation

### Code Quality
- **Formatter:** Biome
- **Linter:** Biome
- **Type Checking:** TypeScript strict mode
- **Code Style:** 2-space indentation, organized imports

### Architecture Patterns
- **Backend:** Dependency injection pattern for services
- **Data Access:** Repository pattern
- **Type Safety:** DTO pattern for API communication
- **API Communication:** Eden (type-safe Elysia client)
- **Plugin System:** Elysia plugin-based architecture

### Development Tools
- **Concurrency:** Bun for parallel development (frontend + backend)
- **Database Management:** Custom migration and seeding system
- **Development Environment:** Docker Compose for PostgreSQL and Redis