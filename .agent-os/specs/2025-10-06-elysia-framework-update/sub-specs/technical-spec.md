# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-06-elysia-framework-update/spec.md

> Created: 2025-10-06
> Version: 1.0.0

## Technical Requirements

### Package Updates

**Core Framework:**
- Update `elysia` from `1.1.4` to `1.4.9` in:
  - `apps/backend/package.json`
  - Root `package.json` (if present)

**Elysia Plugins:**
- Replace `@elysiajs/swagger` `^1.3.1` with `@elysiajs/openapi` `^1.4.11` in:
  - `apps/backend/package.json`
- Update `@elysiajs/eden` from `1.1.2` to latest compatible version (check compatibility with Elysia 1.4.9) in:
  - Root `package.json`
  - `packages/backend-api/package.json`
  - `packages/backend-base/package.json`
- Update other Elysia plugins to compatible versions in `packages/backend-base/package.json`:
  - `@elysiajs/bearer` from `^1.1.1` to latest compatible version
  - `@elysiajs/cors` from `^1.1.0` to latest compatible version
  - `@elysiajs/jwt` from `^1.1.0` to latest compatible version

### Code Changes

**Backend Application (apps/backend/src/index.ts):**
- Replace import: `import { swagger } from "@elysiajs/swagger"` → `import { openapi } from "@elysiajs/openapi"`
- Replace plugin usage: `.use(swagger())` → `.use(openapi())`
- Configure OpenAPI plugin with appropriate options:
  - Documentation configuration (title, version, description)
  - Server URLs for development and production
  - UI preference (Scalar or SwaggerUI)

**Plugin Configuration Example:**
```typescript
.use(openapi({
  documentation: {
    info: {
      title: 'VerseMate API',
      version: '1.0.0',
      description: 'Bible reading platform API with AI-driven translations'
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Development' },
      { url: 'https://api.versemate.com', description: 'Production' }
    ]
  }
}))
```

**Endpoint Changes:**
- Default documentation endpoint changes from `/swagger` to `/openapi`
- Verify all plugins (authPlugin, biblePlugin, userPlugin, adminPlugin) are compatible with Elysia 1.4.9
- Check for any breaking changes in plugin APIs

### Frontend Compatibility

**Eden Treaty Integration (packages/backend-api):**
- Verify Eden Treaty client generation still works with updated Elysia version
- Test type inference for all API routes
- Ensure authentication headers are properly included
- Validate response type accuracy

**Next.js Frontend (apps/frontend-next):**
- Test all API calls using Eden Treaty client
- Verify no breaking changes in request/response handling
- Check authentication flows continue to work
- Validate error handling remains functional

### OpenAPI Schema Validation

**Schema Completeness:**
- Verify all endpoint response types are fully represented in OpenAPI schema
- Check complex types are properly serialized:
  - Union types (e.g., `SuccessResponse | ErrorResponse`)
  - Generic types (e.g., `ApiResponse<T>`)
  - Nested objects and arrays
  - Custom error response types
- Validate authentication/authorization schemas are included
- Ensure request body schemas are complete

**Testing Approach:**
1. Access OpenAPI schema at `/openapi` endpoint (or configured path)
2. Download generated JSON schema
3. Manually inspect critical endpoints for type completeness
4. Optionally validate schema against OpenAPI 3.0/3.1 specification using validation tools

### Build and Deployment

**Development Environment:**
- Run `bun install` to update dependencies
- Run `bun dev` to verify backend starts successfully
- Verify documentation UI is accessible at `/openapi` (or configured path)
- Test frontend development server connects to backend

**Type Checking and Linting:**
- Run `bun tsc` to verify no TypeScript errors introduced
- Run `bun lint` to ensure code style compliance
- Run `bun format` to maintain consistent formatting

**Production Build:**
- Run `cd apps/backend && bun build` to verify backend builds successfully
- Run `cd apps/frontend-next && bun build` to verify frontend builds successfully
- Ensure no build-time errors or warnings related to Elysia updates

### Performance Considerations

- Monitor backend startup time after update (current startup includes language stats refresh)
- Verify OpenAPI schema generation doesn't significantly impact response times
- Check memory usage remains within acceptable limits
- Test concurrent request handling maintains performance

### Backward Compatibility

**Breaking Changes to Address:**
- Document any breaking API changes between Elysia 1.1.4 and 1.4.9
- Update plugin initialization if API changed
- Fix any deprecated method usage
- Ensure all existing API endpoints continue to function identically

**Eden Treaty Client:**
- Verify type inference accuracy hasn't regressed
- Test all existing frontend API calls work without modification
- Validate cookie-based authentication continues to work
- Ensure error handling patterns remain consistent

## Approach

1. **Dependency Update Phase:**
   - Update package.json files with new versions
   - Run `bun install` to update lockfile
   - Review any peer dependency warnings

2. **Code Migration Phase:**
   - Replace swagger imports with openapi imports
   - Update plugin configuration
   - Configure OpenAPI documentation settings

3. **Testing Phase:**
   - Verify backend builds and starts successfully
   - Test OpenAPI documentation UI accessibility
   - Run full test suite
   - Test Eden Treaty client integration
   - Validate frontend API calls

4. **Validation Phase:**
   - Run TypeScript type checking
   - Run linting and formatting checks
   - Verify production builds succeed
   - Test authentication flows
   - Check API endpoint compatibility

5. **Documentation Phase:**
   - Update any internal documentation referencing `/swagger` endpoint
   - Document new OpenAPI endpoint location
   - Note any breaking changes for team awareness

## External Dependencies

This spec does not require new external dependencies beyond updating existing Elysia framework packages to their latest versions. All required dependencies are already part of the Elysia ecosystem:

- **elysia** (1.4.9) - Core framework update
- **@elysiajs/openapi** (1.4.11) - Replaces deprecated @elysiajs/swagger
- **@elysiajs/eden** (latest compatible) - Updated for compatibility with Elysia 1.4.9
- **@elysiajs/bearer** (latest compatible) - Updated for compatibility
- **@elysiajs/cors** (latest compatible) - Updated for compatibility
- **@elysiajs/jwt** (latest compatible) - Updated for compatibility

All packages are official Elysia plugins and maintain the same purpose as their current versions.
