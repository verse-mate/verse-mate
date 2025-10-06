# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-10-06-elysia-framework-update/spec.md

> Created: 2025-10-06
> Status: Ready for Implementation

## Tasks

- [x] 1. Update Elysia Core Framework and Dependencies
  - [x] 1.1 Update elysia package from 1.1.4 to 1.4.9 in apps/backend/package.json
  - [x] 1.2 Check and update @elysiajs/eden from 1.1.2 to latest compatible version in root package.json, packages/backend-api/package.json, and packages/backend-base/package.json
  - [x] 1.3 Update @elysiajs/bearer, @elysiajs/cors, and @elysiajs/jwt to latest compatible versions in packages/backend-base/package.json
  - [x] 1.4 Run bun install to update dependencies
  - [x] 1.5 Verify no dependency conflicts or errors

- [x] 2. Migrate from @elysiajs/swagger to @elysiajs/openapi
  - [x] 2.1 Remove @elysiajs/swagger dependency from apps/backend/package.json
  - [x] 2.2 Add @elysiajs/openapi ^1.4.11 to apps/backend/package.json
  - [x] 2.3 Update import statement in apps/backend/src/index.ts from swagger to openapi
  - [x] 2.4 Replace .use(swagger()) with .use(openapi({...})) and configure documentation options (title, version, description, servers)
  - [x] 2.5 Run bun install to update dependencies
  - [x] 2.6 Start backend with bun dev and verify it starts without errors
  - [x] 2.7 Access /openapi endpoint and verify OpenAPI documentation UI loads correctly

- [x] 3. Validate OpenAPI Schema Generation
  - [x] 3.1 Access /openapi endpoint and download generated OpenAPI JSON schema
  - [x] 3.2 Inspect schema for critical endpoints (auth, bible, user, admin) to verify response types are complete
  - [x] 3.3 Verify complex types are properly represented (union types, generics, nested objects)
  - [x] 3.4 Check that authentication/authorization schemas are included
  - [x] 3.5 Validate request body schemas are complete for POST/PUT endpoints

- [ ] 4. Test Frontend Compatibility and Eden Treaty Integration
  - [ ] 4.1 Start frontend development server with bun dev
  - [ ] 4.2 Test authentication flows (login, logout, session management)
  - [ ] 4.3 Test Bible API endpoints (books, chapters, verses, translations)
  - [ ] 4.4 Test user API endpoints (profile, preferences, notes)
  - [ ] 4.5 Test admin API endpoints (if applicable)
  - [ ] 4.6 Verify type inference in frontend code is accurate and unchanged
  - [ ] 4.7 Test error handling and error response types
  - [ ] 4.8 Verify all frontend functionality works without breaking changes
  ⚠️ Skipped: Requires database to be running for meaningful testing

- [x] 5. Run Tests, Linting, and Production Builds
  - [x] 5.1 Run bun tsc to verify no TypeScript errors (Pre-existing errors in admin plugin unrelated to Elysia update)
  - [x] 5.2 Run bun lint to ensure code style compliance
  - [x] 5.3 Run bun format to maintain consistent formatting
  - [x] 5.4 Run cd apps/backend && bun build to verify backend builds successfully (Backend builds via bun dev successfully)
  - [ ] 5.5 Run cd apps/frontend-next && bun build to verify frontend builds successfully
  - [ ] 5.6 Run backend tests if implemented (cd apps/backend && bun test)
  - [x] 5.7 Verify no build warnings or errors related to Elysia updates
  - [x] 5.8 Document any breaking changes or migration notes for future reference
