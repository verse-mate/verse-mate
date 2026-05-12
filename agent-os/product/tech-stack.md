# Tech Stack

## Runtime & Package Management
- **Bun 1.2.19**: JavaScript/TypeScript runtime replacing Node.js, npm, and bundlers
- **Bun Workspaces**: Monorepo management for multi-package architecture

## Backend

### Web Framework
- **Elysia**: Bun-native web framework with plugin-based architecture
- **Eden Treaty**: Type-safe client-server communication with automatic type inference

### Database
- **PostgreSQL**: Primary relational database
- **Kysely ORM**: Type-safe SQL query builder with compile-time type checking
- **Prisma**: Schema visualization and DBML generation (development tool)

### Caching & Queue
- **Redis**: Caching layer and message broker
- **BullMQ**: Background job processing and queue management for AI operations

### Authentication
- **Custom JWT-like Sessions**: Bearer token authentication with 7-day session duration

### API Architecture
- **Plugin System**: Modular backend structure (authPlugin, biblePlugin, userPlugin, adminPlugin)
- **Service Layer**: Business logic separation (BibleService, AuthService, etc.)
- **Repository Layer**: Data access abstraction (BibleRepository, UserRepository, etc.)

## Frontend

### Framework & UI
- **Next.js 15**: React-based framework with server-side rendering
- **React 18**: UI component library with modern hooks and concurrent features
- **CSS Modules**: Component-scoped styling with PostCSS processing
- **PostCSS**: CSS transformation and optimization

### Type Safety
- **TypeScript**: Strict mode enabled for compile-time type checking
- **Eden Treaty Client**: End-to-end type safety from backend to frontend

### Environment Management
- **@vm/frontend-envs**: Centralized environment configuration package

## AI Integration

### AI Services
- **OpenAI GPT-5 Nano**: AI model for Bible explanations and interactive Q&A
- **Multi-Format Generation**: Summary, detailed, and verse-by-verse explanation formats

### Processing
- **Background Jobs**: AI operations handled asynchronously via BullMQ queues
- **Context Management**: Chapter-specific conversation history and persistence

## Development Tools

### Code Quality
- **Biome**: Unified linter and formatter (replaces ESLint + Prettier)
- **Stylelint**: CSS/SCSS linting and validation
- **TypeScript Compiler**: Type checking across monorepo

### Testing
- **Bun Test**: Native test runner for unit and integration tests
- **Test Coverage**: Built-in coverage reporting

### Database Tools
- **Database Migrations**: Versioned schema changes with rollback support
- **Database Seeding**: Automated test data population
- **Kysely Codegen**: Automatic TypeScript type generation from database schema

## Infrastructure

### Local Development
- **Docker Compose**: Containerized PostgreSQL, Redis, and Prisma Studio
- **Make**: Task automation and setup scripts

### CI/CD
- **Drone CI**: Automated testing, building, and deployment pipeline
- **SSH Deployment**: Production server deployment automation

### Hosting (Planned)
- **Cloudflare Workers**: Frontend hosting and edge computing

## Project Structure

### Monorepo Organization
```
/apps
  /backend - Elysia API server (port 4000)
  /frontend-next - Next.js application (port 3000)
  /website - Marketing website

/packages
  /backend-api - Eden Treaty client SDK
  /backend-base - Core backend modules (auth, bible, chat, queue, workers)
  /database - Kysely ORM, migrations, seeds
  /emails - React Email components
  /frontend-base - Shared UI components and utilities
  /frontend-envs - Environment configuration
```

### Configuration Files
- **biome.json**: Linting and formatting rules
- **tsconfig.json**: TypeScript compiler options (strict mode)
- **docker-compose.yml**: Local infrastructure services
- **.drone.yml**: CI/CD pipeline configuration

## Code Standards

### Style Guide
- **Indentation**: 2 spaces
- **Import Organization**: Enforced by Biome
- **Type Safety**: TypeScript strict mode required
- **Formatting**: Automated via Biome

### Architecture Patterns
- **Plugin-Based Backend**: Modular Elysia plugins for feature separation
- **Service-Repository Pattern**: Business logic and data access layers
- **Type-Safe API Communication**: Eden Treaty for end-to-end type inference
- **Background Processing**: Async job handling for long-running operations
