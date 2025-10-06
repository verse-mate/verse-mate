# Spec Requirements Document

> Spec: Elysia Framework Update for Enhanced OpenAPI Type Generation
> Created: 2025-10-06
> Status: Planning

## Overview

Update the Elysia framework from version 1.1.4 to 1.4.9 and migrate from the deprecated @elysiajs/swagger plugin to the new @elysiajs/openapi plugin (v1.4.11). This update will improve OpenAPI schema generation with better support for complex TypeScript types, enabling external applications (particularly React Native apps) to generate accurate type-safe API clients from the OpenAPI specification.

## User Stories

### Backend Developer Integration

As a backend developer maintaining the VerseMate API, I want to use the latest Elysia framework with improved OpenAPI generation, so that external clients can automatically generate accurate TypeScript types from our API specification without manual intervention.

The current @elysiajs/swagger plugin is deprecated and produces incomplete OpenAPI schemas for complex response types, particularly union types, generics, and custom error responses. The new @elysiajs/openapi plugin in Elysia 1.4 introduces "OpenAPI type gen" which generates schemas directly from TypeScript types and supports Standard Schema, enabling accurate type representation for all API endpoints.

### React Native Developer Experience

As a React Native developer building a mobile app for VerseMate, I want to consume a complete and accurate OpenAPI specification from the backend API, so that I can use code generation tools (like openapi-generator or swagger-typescript-api) to create a fully type-safe API client without encountering missing types or manual workarounds.

With the improved OpenAPI generation, the React Native team will receive accurate schemas for all response types, error types, and complex nested structures, eliminating the need to manually define types or fix incomplete generated code.

## Spec Scope

1. **Elysia Core Framework Update** - Update elysia package from 1.1.4 to 1.4.9 across all backend packages and applications.

2. **OpenAPI Plugin Migration** - Replace @elysiajs/swagger with @elysiajs/openapi (v1.4.11) in the backend application and update all plugin configurations.

3. **OpenAPI Documentation Endpoint** - Update the documentation endpoint from /swagger to /openapi and ensure proper configuration of the new plugin.

4. **Frontend Compatibility Fixes** - Identify and fix any breaking changes in the Next.js frontend caused by Elysia framework updates, ensuring Eden Treaty integration continues to work correctly.

5. **OpenAPI Schema Validation** - Verify that the generated OpenAPI schema includes complete type information for all endpoints, responses, and error types, particularly for complex types that were previously incomplete.

## Out of Scope

- Creating a dedicated React Native package or Eden Treaty wrapper for React Native (external repository responsibility)
- Setting up code generation pipelines or tooling for React Native clients
- Updates to other Elysia plugins beyond @elysiajs/openapi (e.g., JWT, CORS, WebSocket)
- Database schema changes or migrations
- New API endpoints or business logic changes

## Expected Deliverable

1. All backend packages and applications successfully running on Elysia 1.4.9 with @elysiajs/openapi plugin, accessible at /openapi endpoint with complete type schemas.

2. Existing Next.js frontend application continues to function correctly with no breaking changes in Eden Treaty integration or API communication.

3. Generated OpenAPI schema can be accessed and validated to confirm it includes complete response type definitions for all endpoints (manual inspection or automated validation).

## Spec Documentation

- Tasks: @.agent-os/specs/2025-10-06-elysia-framework-update/tasks.md
- Technical Specification: @.agent-os/specs/2025-10-06-elysia-framework-update/sub-specs/technical-spec.md
