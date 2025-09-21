# VerseMate Coding Standards

> Last Updated: 2025-01-19
> Version: 1.0.0

## Overview

These coding standards are derived from analysis of the VerseMate codebase and reflect the established patterns and practices used throughout the project.

## Architecture Patterns

### Monorepo Structure
- **Apps**: Deployable applications (`apps/backend`, `apps/frontend-next`)
- **Packages**: Shared code libraries (`packages/backend-base`, `packages/frontend-base`, etc.)
- **Workspace Management**: Use Bun workspaces with `workspace:*` dependencies

### Backend Architecture
- **Plugin-based**: Use Elysia plugin architecture for modular functionality
- **Dependency Injection**: Services receive dependencies via constructor injection
- **Repository Pattern**: Separate data access logic into repository classes
- **DTO Pattern**: Use typed DTOs for API request/response structures

### Frontend Architecture
- **Component Library**: Shared components in `packages/frontend-base`
- **CSS Modules**: Component-scoped styling with `.module.css` files
- **Type-safe API**: Use Eden client for backend communication
- **State Management**: Use React state patterns and context providers

## TypeScript Standards

### Type Safety
- **Strict Mode**: Always use TypeScript strict mode
- **Explicit Types**: Use explicit types for function parameters and return values
- **Database Types**: Import types from generated database models
- **No Any**: Avoid `any` type (disabled in Biome config)

### Import Organization
- **Organized Imports**: Use Biome's automatic import organization
- **Workspace Imports**: Use workspace package names (e.g., `from "backend-base"`)
- **Relative Imports**: Use relative imports for same-package files
- **Type Imports**: Use `import type` for type-only imports

## Service Layer Patterns

### Service Classes
```typescript
export class BibleService {
  constructor(
    private readonly db: db,
    private readonly bibleRepository: BibleRepository,
  ) {}

  async getBook({ book_id, chapter_number, version_id }: ServiceDto) {
    // Implementation
  }
}
```

### Repository Classes
```typescript
export class BibleRepository {
  constructor(private readonly db: db) {}

  async getBook({ book_id }: { book_id: string }) {
    return await this.db
      .selectFrom('books')
      .where('book_id', '=', book_id)
      .selectAll()
      .executeTakeFirst();
  }
}
```

## React Component Standards

### Component Structure
```typescript
import { forwardRef, type ReactNode } from "react";
import styles from "./Component.module.css";

export interface ComponentProps {
  children: ReactNode;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}

export const Component = forwardRef<HTMLButtonElement, ComponentProps>(
  ({ children, variant = "primary", disabled }, ref) => {
    return (
      <button
        ref={ref}
        className={styles.component}
        disabled={disabled}
      >
        {children}
      </button>
    );
  }
);
```

### Props Patterns
- **Default Values**: Provide sensible defaults in destructuring
- **ForwardRef**: Use `forwardRef` for reusable components
- **Interface Definitions**: Always define explicit prop interfaces
- **Optional Props**: Mark optional props with `?`

## Database Patterns

### Query Building
```typescript
// Use Kysely query builder
const result = await db
  .selectFrom('users')
  .where('user_id', '=', userId)
  .selectAll()
  .executeTakeFirst();
```

### Field Naming
- **Database Fields**: Use `snake_case` (e.g., `user_id`, `chapter_number`)
- **TypeScript Objects**: Use `camelCase` when mapping to TypeScript
- **Consistency**: Maintain consistent field naming across related tables

## API Patterns

### Plugin Structure
```typescript
const plugin = new Elysia()
  .use(authGuard)
  .get('/books/:book_id', async ({ params, user }) => {
    // Implementation
  })
  .post('/highlights', async ({ body, user }) => {
    // Implementation
  });
```

### Error Handling
- **Consistent Responses**: Use consistent error response format
- **Type Safety**: Leverage Elysia's built-in type inference
- **Authentication**: Use auth guards for protected routes

## Code Quality Tools

### Biome Configuration
- **Formatting**: 2-space indentation, organized imports
- **Linting**: Recommended rules with specific overrides
- **Disabled Rules**: `noExplicitAny: off`, `noForEach: off`

### Development Workflow
- **Concurrent Development**: Use `bun dev` for parallel frontend/backend
- **Type Checking**: Run `bun tsc` for project-wide type validation
- **Formatting**: Use `bun format` before commits
- **Linting**: Use `bun lint` for code quality checks

## File Organization

### Directory Structure
```
packages/backend-base/src/
├── auth/           # Authentication module
├── bible/          # Bible-specific functionality
├── shared/         # Shared utilities
├── user/           # User management
└── workers/        # Background job workers
```

### File Naming
- **TypeScript Files**: `camelCase.ts` or `PascalCase.tsx` for components
- **CSS Modules**: `ComponentName.module.css`
- **Test Files**: `filename.test.ts`
- **Plugin Files**: `module.plugin.ts`

## Background Jobs

### Queue Processing
```typescript
const worker = new Worker(
  'explanation-generation',
  async (job) => {
    const service = new ExplanationService(db, repository);
    return await service.generateExplanation(job.data);
  },
  { connection: redisConnection }
);
```

### Job Patterns
- **BullMQ**: Use BullMQ for background job processing
- **Service Injection**: Inject required services into worker functions
- **Error Handling**: Implement proper error handling and retries

## Environment Configuration

### Environment Files
- **Backend**: `apps/backend/.env`
- **Frontend**: `apps/frontend-next/.env`
- **Database**: `packages/database/.env`
- **Shared**: `packages/backend-base/.env`

### Configuration Pattern
- **Type Safety**: Define environment variable types
- **Validation**: Validate required environment variables on startup
- **Defaults**: Provide sensible defaults where appropriate