# Spec Requirements Document

> Spec: OpenAPI Response Schemas
> Created: 2025-10-09

## Overview

Add explicit response type definitions to all VerseMate Elysia backend endpoints using the `response` parameter pattern to ensure proper OpenAPI schema generation for the mobile app client. This will enable type-safe API client generation for the React Native mobile application while maintaining compatibility with existing Eden Treaty client used by the Next.js frontend.

## User Stories

### Mobile App Developer Integration

As a mobile app developer, I want to generate type-safe TypeScript clients from the OpenAPI specification, so that I can integrate with the VerseMate API with full type safety and autocompletion.

**Workflow**: The developer runs an OpenAPI code generator tool against the VerseMate API's OpenAPI spec endpoint. The generated client includes properly typed request bodies, query parameters, and response types for all endpoints. The developer imports this client into the React Native app and immediately benefits from IDE autocompletion, compile-time type checking, and runtime validation when making API calls.

### API Consistency and Documentation

As a backend developer, I want explicit response schemas defined for all endpoints, so that the API contract is self-documenting and consistent across both Eden Treaty and OpenAPI clients.

**Workflow**: When defining a new endpoint, the developer adds both TypeScript return type annotations and the Elysia `response` parameter with status code mappings. The OpenAPI plugin automatically generates accurate schemas that match the actual response structure, ensuring documentation stays in sync with implementation.

## Spec Scope

1. **Response Schema Pattern** - Define explicit `response` parameter objects with status code mappings (200, 400, 500) for all existing endpoints across auth, bible, user, chat, and admin plugins
2. **Type Definition Reuse** - Create reusable Elysia `t` schema definitions for common response structures (success responses, error responses, entity types) that can be imported across plugins
3. **Error Response Standardization** - Standardize error response schemas to consistently return `{ message: string, data: any }` structure for 400 and 500 status codes
4. **OpenAPI Validation** - Verify that OpenAPI spec endpoint correctly exposes all response schemas with proper type information for mobile client generation
5. **Documentation Updates** - Update CLAUDE.md to document the response schema pattern and conventions for future endpoint development

## Out of Scope

- Modifying the existing Eden Treaty client implementation or frontend API calls
- Changing the actual response data structures or business logic
- Adding new endpoints or features beyond response type definitions
- Implementing runtime response validation beyond what Elysia provides by default
- Creating the mobile app client code generator configuration or implementation

## Expected Deliverable

1. All endpoints in `packages/backend-base/src/*/` plugins have explicit `response` parameter definitions matching the example pattern provided
2. OpenAPI documentation endpoint (`/openapi`) displays accurate response schemas for all endpoints with proper type information
3. A test script or curl command demonstrates that the OpenAPI spec can be fetched and includes complete response type definitions for representative endpoints from each plugin
