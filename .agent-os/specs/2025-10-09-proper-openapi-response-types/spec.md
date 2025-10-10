# Spec Requirements Document

> Spec: Proper OpenAPI Response Types
> Created: 2025-10-09
> Status: Planning

## Overview

Replace all `t.Any()` usage in OpenAPI response schemas with proper TypeScript type definitions to ensure high-quality OpenAPI specifications that enable accurate type-safe client generation for mobile apps. This enhancement will provide concrete type information for all API responses, improving developer experience and preventing runtime errors.

## User Stories

### Mobile Developer Integration

As a mobile developer integrating with the VerseMate API, I want accurate TypeScript type definitions in the OpenAPI spec, so that I can generate type-safe API clients that catch errors at compile time rather than runtime.

When mobile developers generate API clients from the OpenAPI specification, they currently receive `any` types for many response fields due to `t.Any()` usage. This leads to missing type safety, no autocomplete support, and potential runtime errors. With proper types defined, the generated clients will have full IntelliSense support, compile-time validation, and accurate documentation.

### API Documentation Quality

As a developer reading API documentation, I want to see concrete type definitions for all response fields, so that I understand exactly what data structure to expect from each endpoint.

Current API documentation shows generic "any" types which don't convey meaningful information about response structures. With proper types, the documentation will clearly show field names, types, optional/required status, and nested object structures.

### Frontend Development

As a frontend developer using the Eden Treaty client, I want improved type inference for API responses, so that I get better autocomplete and type checking in my IDE.

While Eden Treaty provides type safety, the underlying `t.Any()` schemas weaken type inference. With concrete types, TypeScript can provide more accurate suggestions and catch potential errors earlier in development.

## Spec Scope

1. **Bible Response Schemas** - Replace `t.Any()` in bible-response.schema.ts with proper object schemas for books, chapters, explanations, chat messages, notes, bookmarks, and highlights
2. **Admin Response Schemas** - Replace `t.Any()` in admin-response.schema.ts with concrete types for batch operations, explanations, prompts, users, and statistics
3. **Type Definition Strategy** - Analyze actual service return types to create accurate schema definitions that match runtime data structures
4. **Nested Object Handling** - Properly type complex nested structures like chat history groups, book metadata, and explanation objects
5. **Array Response Types** - Define proper array item schemas for collections (languages, users, messages, etc.)

## Out of Scope

- Changing service return types or business logic (only updating schema definitions)
- Modifying database models or migrations
- Updating frontend code (Eden Treaty types will improve automatically)
- Adding new validation rules beyond type definitions
- Performance optimizations or query improvements

## Expected Deliverable

1. All response schemas use concrete Elysia type definitions (`t.Object`, `t.String`, `t.Number`, etc.) with no remaining `t.Any()` usage
2. OpenAPI specification at `/openapi/json` shows detailed type information for all response fields
3. All existing tests continue to pass with no breaking changes
4. TypeScript compilation succeeds with proper type inference throughout the application

## Spec Documentation

- Tasks: @.agent-os/specs/2025-10-09-proper-openapi-response-types/tasks.md
- Technical Specification: @.agent-os/specs/2025-10-09-proper-openapi-response-types/sub-specs/technical-spec.md
