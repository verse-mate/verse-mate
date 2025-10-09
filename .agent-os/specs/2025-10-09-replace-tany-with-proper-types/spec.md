# Spec Requirements Document

> Spec: Replace t.Any() with Proper TypeScript Types
> Created: 2025-10-09
> Status: Planning

## Overview

Replace all 44+ instances of `t.Any()` in Elysia response schemas with properly typed TypeBox schemas that accurately reflect the actual data structures returned by the API. This will improve type safety, enable better OpenAPI documentation generation, and provide accurate TypeScript types for frontend clients using Eden Treaty.

## User Stories

### Frontend Developer Type Safety

As a frontend developer using the Eden Treaty client, I want accurate TypeScript types for all API responses, so that I can catch type errors at compile time and have proper IDE autocomplete for all response fields.

Currently, responses typed with `t.Any()` provide no type information to the Eden client, forcing developers to manually inspect API responses or rely on runtime errors. With proper types, the TypeScript compiler will catch mismatches and IDE tooling will provide accurate autocomplete and inline documentation.

### Backend Developer API Documentation

As a backend developer maintaining the API, I want the OpenAPI schema to accurately document all response structures, so that external consumers can generate correct client code and understand exactly what data each endpoint returns.

The current `t.Any()` types produce incomplete OpenAPI schemas that show response types as `{}` or generic objects, providing no useful information for API consumers. Proper TypeBox schemas will generate complete OpenAPI definitions with field names, types, and descriptions.

### Quality Assurance Through Types

As a developer on the team, I want compile-time guarantees that our API responses match their declared schemas, so that we catch schema drift and breaking changes before they reach production.

With `t.Any()`, there's no validation that responses match expectations. Proper TypeBox schemas enable runtime validation and ensure the API contract is enforced, catching bugs where responses don't match documentation.

## Spec Scope

1. **Bible Plugin Response Types** - Replace 22 instances of `t.Any()` with proper schemas for books, languages, chapters, explanations, chat history, ratings, bookmarks, notes, and highlights
2. **Admin Plugin Response Types** - Replace 22 instances of `t.Any()` with proper schemas for user lists, batch operations, prompts, explanations, stats, and grading
3. **Type Schema Definitions** - Create reusable TypeBox schema definitions for common response structures (User, Book, Chapter, Highlight, Note, etc.)
4. **OpenAPI Schema Validation** - Verify that generated OpenAPI documentation contains complete type information for all endpoints
5. **Eden Treaty Type Verification** - Test that frontend Eden Treaty client receives accurate type inference for all replaced schemas

## Out of Scope

- Changing the actual data structures returned by services/repositories (only updating the type definitions)
- Refactoring business logic or controller implementation
- Adding new API endpoints or modifying existing endpoint behavior
- Database schema changes
- Frontend code changes (beyond verifying type inference works)

## Expected Deliverable

1. All `t.Any()` instances in bible.plugin.ts and admin.plugin.ts replaced with proper TypeBox schemas that accurately reflect actual response data structures
2. TypeScript compilation succeeds with no type errors
3. All existing tests pass (30 pass, 13 skip, 0 fail maintained)
4. OpenAPI schema at `/openapi` shows complete type definitions (not generic objects)
5. Eden Treaty client in frontend has accurate type inference for all updated endpoints (verified through spot checks)

## Spec Documentation

- Tasks: @.agent-os/specs/2025-10-09-replace-tany-with-proper-types/tasks.md
- Technical Specification: @.agent-os/specs/2025-10-09-replace-tany-with-proper-types/sub-specs/technical-spec.md
