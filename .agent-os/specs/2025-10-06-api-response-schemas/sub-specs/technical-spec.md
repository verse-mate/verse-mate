# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-06-api-response-schemas/spec.md

> Created: 2025-10-06
> Version: 1.0.0

## Technical Requirements

### 1. Common Response Models

Create centralized response model definitions in `packages/backend-base/src/common/response-models.ts`:

- **ErrorResponse**: Standard error response structure
  ```typescript
  {
    error: string      // Error type/code
    message: string    // Human-readable error message
    details?: any      // Optional additional error details
  }
  ```

- **PaginatedResponse**: Standard pagination response structure (when needed)
- **Model References**: Use Elysia's `t.Ref()` for reusable schemas

**Important**: Do NOT wrap success responses in a generic wrapper object. Return data objects directly as handlers currently do, since Eden Treaty already wraps responses in `{ data }` on the client side.

### 2. Custom Error Classes

Implement custom error classes in `packages/backend-base/src/common/errors.ts`:

- `UnauthorizedError` (401): Authentication required or failed
- `ForbiddenError` (403): Authenticated but lacks permissions
- `NotFoundError` (404): Resource not found
- `ValidationError` (400): Input validation failed
- `ConflictError` (409): Resource conflict (e.g., duplicate email)

All custom errors should extend base `Error` class with status code property.

### 3. Global Error Handler

Implement global `onError` handler in backend plugins:

- Catch all custom error classes
- Transform to standardized ErrorResponse format
- Map error types to appropriate HTTP status codes
- Log errors for debugging
- Return consistent JSON error responses

### 4. Response Schema Implementation

For each endpoint, add the `response` property with status-specific schemas:

```typescript
// Direct object return (NOT wrapped in { data })
.get('/endpoint', async () => {
  return { id: '123', name: 'Example' }
}, {
  response: {
    200: t.Object({
      id: t.String(),
      name: t.String()
    }),
    401: t.Ref('ErrorResponse'),
    404: t.Ref('ErrorResponse'),
    500: t.Ref('ErrorResponse')
  }
})
```

### 5. Status Function Migration

Replace direct error throwing with status() function for type-safe responses:

**Before:**
```typescript
if (!user) throw new Error('User not found')
```

**After:**
```typescript
if (!user) throw new NotFoundError('User not found')
```

### 6. HTTP Status Code Standards

Follow REST conventions:
- **200 OK**: Successful GET, PUT, PATCH requests
- **201 Created**: Successful POST requests creating resources
- **204 No Content**: Successful DELETE requests
- **400 Bad Request**: Validation errors
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Permission denied
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict
- **500 Internal Server Error**: Unexpected server errors

## Approach

1. **Phase 1**: Create common response models and error classes
2. **Phase 2**: Implement global error handler in base plugins
3. **Phase 3**: Update auth plugin endpoints with response schemas
4. **Phase 4**: Update bible plugin endpoints with response schemas
5. **Phase 5**: Update user plugin endpoints with response schemas
6. **Phase 6**: Update admin plugin endpoints with response schemas
7. **Phase 7**: Validate OpenAPI schema generation and Eden Treaty compatibility
8. **Phase 8**: Test error handling across all endpoints

## External Dependencies

- **Elysia**: Core framework with response type support
- **@elysiajs/swagger**: OpenAPI documentation generation
- **Eden Treaty**: Type-safe client (must maintain compatibility)
- **TypeScript**: Type inference and validation

## Implementation Notes

- Maintain backwards compatibility with existing Eden Treaty client usage
- Ensure type inference works correctly in frontend after changes
- Use Elysia model references to avoid schema duplication
- Document response schemas in OpenAPI/Swagger UI
- Add examples to response schemas where helpful for API consumers
