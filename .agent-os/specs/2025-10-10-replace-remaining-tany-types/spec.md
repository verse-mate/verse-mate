# Spec Requirements Document

> Spec: Replace Remaining t.Any() Types with Proper TypeBox Schemas
> Created: 2025-10-09
> Status: Planning

## Overview

Replace the remaining 32 t.Any() instances in entity files with proper TypeBox schemas by analyzing actual service return types and database structures. This completes the type safety improvements started in the previous spec, ensuring all API responses have accurate type definitions for Eden Treaty clients and OpenAPI documentation.

## User Stories

### Frontend Developer Strong Typing

As a frontend developer using Eden Treaty, I want all API responses to have accurate TypeScript types instead of 'any', so that I get compile-time errors when accessing non-existent fields and full IDE autocomplete for all response properties.

Currently, 32 responses typed with t.Any() provide no type safety. When I call these endpoints, TypeScript accepts any property access, leading to runtime errors when fields are misspelled or don't exist. With proper types, the compiler catches these errors immediately.

### Backend Developer Type Enforcement

As a backend developer, I want TypeBox schemas to match actual service responses, so that runtime validation catches schema drift before it reaches production and breaking changes are detected at the API boundary.

With t.Any(), there's no validation between what services return and what schemas declare. Proper TypeBox schemas enable runtime validation that enforces the API contract, catching bugs where implementations drift from documentation.

### API Documentation Accuracy

As an API consumer, I want OpenAPI schema to show complete type information for all endpoints, so that I can generate accurate client code and understand exactly what data structure each endpoint returns without trial and error.

The current t.Any() types produce incomplete OpenAPI schemas showing generic objects. Proper schemas generate complete OpenAPI definitions with all fields, types, formats, and descriptions.

## Spec Scope

1. **Bible Plugin Types** - Replace 11 t.Any() instances with proper schemas for: Book, LastChapterRead, GroupedChatHistory, MessageHistory, NewConversation, SaveRating, UpdateRating, SaveLastChapterRead, MessageSave
2. **Admin Plugin Types** - Replace 21 t.Any() instances with proper schemas for: UsersList, BatchList, BatchChildren, BatchSummary, MonitorBatch, DeleteExplanation, ExplanationComparison, BulkDelete, SetActiveDefault, ExplanationHistory, SystemPrompts, UserPrompts, UpdatePrompt, DeletePrompt, PromptStatus, RestoreDefaults, Playground, ExistingExplanation, Stats
3. **Type Analysis** - For each t.Any(), trace through service/repository to determine actual structure
4. **Implementation Phases** - Prioritize by complexity: Simple (20 instances), Medium (8 instances), Complex (2 instances), Keep Dynamic (2 instances)
5. **Validation** - Test each replacement with TypeScript compilation and verify OpenAPI output

## Out of Scope

- Changing service/repository return types or business logic
- Modifying endpoint behavior or adding new endpoints
- Database schema changes
- Frontend code changes beyond verifying type inference

## Expected Deliverable

1. All 30 typeable t.Any() instances replaced with proper TypeBox schemas (2 dynamic instances documented as intentional)
2. TypeScript compilation succeeds with no new errors
3. All existing tests continue passing
4. OpenAPI schema shows complete type definitions for all updated endpoints
5. Analysis document explaining what was typed and what remains dynamic with justification

## Spec Documentation

- Tasks: @.agent-os/specs/2025-10-10-replace-remaining-tany-types/tasks.md
- Technical Specification: @.agent-os/specs/2025-10-10-replace-remaining-tany-types/sub-specs/technical-spec.md
- Type Analysis: @.agent-os/specs/2025-10-10-replace-remaining-tany-types/sub-specs/type-analysis.md
