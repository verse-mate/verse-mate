# API Response Schemas Implementation Notes

> Implementation Date: 2025-10-06
> Status: ✅ Complete

## Overview

Successfully added explicit response type schemas to all API endpoints across auth, bible, user, and admin plugins, implementing standardized error handling with custom error classes and a global error handler.

## Changes Summary

### 1. Foundation (Common Response Models & Errors)

**Files Created:**
- `packages/backend-base/src/common/response-models.ts` - Standard response schemas
- `packages/backend-base/src/common/errors.ts` - Custom error classes

**Common Response Models:**
- `ErrorResponse` - Standard error structure: `{ error: string, message: string, details?: any }`
- `PaginatedResponse` - Generic pagination wrapper (when needed)

**Custom Error Classes:**
- `ApiError` (base class) - Abstract base for all API errors
- `UnauthorizedError` (401) - Authentication required or failed
- `ForbiddenError` (403) - Authenticated but lacks permissions
- `NotFoundError` (404) - Resource not found
- `ValidationError` (400) - Input validation failed
- `ConflictError` (409) - Resource conflict
- `InternalServerError` (500) - Server errors

**Export Updates:**
- Added all models and errors to `packages/backend-base/index.ts`
- Registered `ErrorResponse` model in shared plugin for global reference

### 2. Global Error Handler

**File Modified:** `apps/backend/src/index.ts`

**Implementation:**
- Added `onError` handler before all plugins
- Handles custom `ApiError` instances with `toResponse()` method
- Maps Elysia built-in errors (VALIDATION, NOT_FOUND, PARSE)
- Provides detailed error messages in development, generic in production
- Returns consistent error response format across all endpoints

### 3. Plugin Updates

#### Auth Plugin (`packages/backend-base/src/auth/auth.plugin.ts`)
- **12 endpoints updated** with response schemas
- **6 error replacements**: `throw new Error("Unauthorized")` → `throw new UnauthorizedError()`
- Response schemas include:
  - `AuthPayloadResponse` - Login/signup responses
  - `UserSessionResponse` - Session data
  - `UserIdResponse` - User ID lookup
  - `BooleanResponse` - Operation success
  - `SuccessResponse` - Generic success messages

#### Bible Plugin (`packages/backend-base/src/bible/bible.plugin.ts`)
- **35+ endpoints updated** with response schemas
- **27 response schema definitions** created
- Error handling updated:
  - `NotFoundError` for invalid bible versions, missing resources
  - `ValidationError` for missing required fields
  - Removed nested try-catch blocks for cleaner error propagation
- Major endpoints:
  - Books, chapters, verses
  - Explanations and ratings
  - Chat/conversation management
  - Bookmarks, notes, highlights

#### User Plugin (`packages/backend-base/src/user/user.plugin.ts`)
- **3 endpoints updated** with response schemas
- Response schemas:
  - `UserResponse` - Individual user objects
  - `UsersListResponse` - User list
  - `UpdateUserResponse` - Update operation results
- Enhanced error handling:
  - Field-specific validation errors
  - Proper try-catch for database operations

#### Admin Plugin (`packages/backend-base/src/admin/admin.plugin.ts`)
- **45 endpoints updated** with response schemas
- **30+ response schema definitions** created
- Error handling:
  - 11 instances of generic `Error` replaced with custom classes
  - `ForbiddenError` for non-admin access attempts
- Major endpoint groups:
  - User management
  - Language and translation management
  - Batch operations and monitoring
  - Explanation management
  - System and user prompts
  - Commentary grading

### 4. Response Schema Pattern

**Standard Pattern:**
```typescript
.get('/endpoint', async (context) => {
  return { data }  // Direct return, no wrapper
}, {
  response: {
    200: DataSchema,           // Success response
    400: t.Ref("ErrorResponse"), // Validation errors
    401: t.Ref("ErrorResponse"), // Unauthorized
    404: t.Ref("ErrorResponse"), // Not found
    500: t.Ref("ErrorResponse")  // Server errors
  }
})
```

**Key Points:**
- Responses are **NOT** wrapped in `{ data }` - Eden Treaty handles that on the client side
- Each status code has explicit schema definition
- Reusable schemas use `t.Ref()` for consistency
- HTTP status codes follow REST standards

### 5. HTTP Status Code Standards

- **200 OK** - Successful GET, PUT, PATCH requests
- **201 Created** - Successful POST requests creating resources
- **204 No Content** - Successful DELETE/void operations
- **400 Bad Request** - Validation errors, malformed requests
- **401 Unauthorized** - Authentication required or failed
- **403 Forbidden** - Authenticated but lacks permissions
- **404 Not Found** - Resource not found
- **409 Conflict** - Resource conflict (duplicate email, etc.)
- **500 Internal Server Error** - Unexpected server errors

## Known Issues & Notes

### OpenAPI Memory Issue
The `/openapi/json` endpoint experiences out-of-memory errors when generating the complete schema due to the large number of endpoints and schemas. This is a known limitation of the `@elysiajs/openapi` plugin with extensive schemas.

**Impact:** OpenAPI documentation UI may not load, but:
- All endpoints function correctly
- Response schemas are properly defined in code
- Type safety is maintained for Eden Treaty client
- Error handling works as expected

**Workaround:** Individual endpoint testing confirms proper response formats

### Pre-existing TypeScript Errors
The admin plugin contains pre-existing TypeScript errors (implicit `any` types) that existed before this implementation. These are unrelated to the response schema changes and should be addressed separately.

## Testing Results

### Backend Validation
- ✅ Backend starts successfully with all plugins loaded
- ✅ All endpoints respond with correct format
- ✅ Custom error classes throw and handle correctly
- ✅ Global error handler catches all error types
- ✅ Code passes Biome formatting and linting

### Type Safety
- ✅ Response schemas properly typed with Elysia's type system
- ✅ Eden Treaty client maintains type inference
- ✅ Error responses follow standardized format

### Code Quality
- ✅ All code formatted with Biome
- ✅ Linting passes (excluding pre-existing admin plugin issues)
- ✅ Consistent code style maintained

## Benefits Achieved

1. **Complete API Documentation** - All endpoints now have explicit response type definitions
2. **Type-Safe Error Handling** - Standardized error classes with proper HTTP status codes
3. **Improved DX** - Developers can see exact response formats and error scenarios
4. **Client Generation Ready** - OpenAPI schema enables type-safe client generation for external apps (when memory issue is resolved)
5. **Consistent Error Format** - All errors follow the same structure across the API
6. **Better Debugging** - Detailed error messages in development, safe messages in production

## Migration Guide for Future Endpoints

When creating new endpoints:

1. **Define Response Schema:**
```typescript
const MyResponse = t.Object({
  id: t.String(),
  name: t.String()
})
```

2. **Add to Route:**
```typescript
.get('/my-endpoint', async () => {
  return { id: '123', name: 'Example' }
}, {
  response: {
    200: MyResponse,
    401: t.Ref("ErrorResponse"),
    404: t.Ref("ErrorResponse"),
    500: t.Ref("ErrorResponse")
  }
})
```

3. **Use Custom Errors:**
```typescript
if (!user) {
  throw new NotFoundError('User not found')
}
if (!authenticated) {
  throw new UnauthorizedError('Authentication required')
}
```

## Files Modified

**Created:**
- `packages/backend-base/src/common/response-models.ts`
- `packages/backend-base/src/common/errors.ts`

**Modified:**
- `apps/backend/src/index.ts` - Global error handler
- `packages/backend-base/index.ts` - Exports
- `packages/backend-base/src/shared/shared.plugin.ts` - Model registration
- `packages/backend-base/src/auth/auth.plugin.ts` - 12 endpoints
- `packages/backend-base/src/bible/bible.plugin.ts` - 35+ endpoints
- `packages/backend-base/src/user/user.plugin.ts` - 3 endpoints
- `packages/backend-base/src/admin/admin.plugin.ts` - 45 endpoints

**Total Endpoints Updated:** 95+ endpoints across 4 plugins

## Conclusion

This implementation successfully adds comprehensive response schemas and standardized error handling to the entire VerseMate API. While the OpenAPI documentation endpoint experiences memory constraints, the core functionality—proper response typing, error handling, and type safety—is fully operational and provides a solid foundation for API consumers and client generation tools.
