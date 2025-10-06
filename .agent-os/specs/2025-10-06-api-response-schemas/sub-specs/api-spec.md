# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-10-06-api-response-schemas/spec.md

> Created: 2025-10-06
> Version: 1.0.0

## Standard Error Response Format

All error responses will follow this structure:

```typescript
{
  error: string      // Error type/code (e.g., "UNAUTHORIZED", "NOT_FOUND")
  message: string    // Human-readable error message
  details?: any      // Optional additional context (validation errors, etc.)
}
```

### Error Response Examples

**401 Unauthorized:**
```json
{
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

**404 Not Found:**
```json
{
  "error": "NOT_FOUND",
  "message": "User not found"
}
```

**400 Validation Error:**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": {
    "email": "Invalid email format",
    "password": "Password must be at least 8 characters"
  }
}
```

## Affected Endpoints by Plugin

### Auth Plugin (`packages/backend-base/src/auth/`)

#### POST /auth/register
**Response Schemas:**
- `201`: User registration successful with token
  ```typescript
  {
    user: UserObject,
    token: string
  }
  ```
- `400`: Validation error (invalid email, weak password)
- `409`: Conflict (email already exists)
- `500`: Internal server error

#### POST /auth/login
**Response Schemas:**
- `200`: Login successful with token
  ```typescript
  {
    user: UserObject,
    token: string
  }
  ```
- `400`: Validation error
- `401`: Invalid credentials
- `500`: Internal server error

#### POST /auth/logout
**Response Schemas:**
- `200`: Logout successful
  ```typescript
  { success: true }
  ```
- `401`: Not authenticated
- `500`: Internal server error

#### GET /auth/me
**Response Schemas:**
- `200`: Current user data
  ```typescript
  { user: UserObject }
  ```
- `401`: Not authenticated
- `500`: Internal server error

#### POST /auth/refresh
**Response Schemas:**
- `200`: Token refreshed
  ```typescript
  { token: string }
  ```
- `401`: Invalid or expired refresh token
- `500`: Internal server error

### Bible Plugin (`packages/backend-base/src/bible/`)

#### GET /bible/books
**Response Schemas:**
- `200`: List of Bible books
  ```typescript
  { books: BookObject[] }
  ```
- `500`: Internal server error

#### GET /bible/books/:bookId/chapters
**Response Schemas:**
- `200`: List of chapters for a book
  ```typescript
  { chapters: ChapterObject[] }
  ```
- `404`: Book not found
- `500`: Internal server error

#### GET /bible/verses
**Response Schemas:**
- `200`: Verses data
  ```typescript
  { verses: VerseObject[] }
  ```
- `400`: Invalid query parameters
- `404`: Verses not found
- `500`: Internal server error

#### POST /bible/explanations
**Response Schemas:**
- `201`: Explanation created
  ```typescript
  { explanation: ExplanationObject }
  ```
- `400`: Validation error
- `401`: Not authenticated
- `500`: Internal server error

#### GET /bible/explanations/:id
**Response Schemas:**
- `200`: Explanation data
  ```typescript
  { explanation: ExplanationObject }
  ```
- `401`: Not authenticated
- `404`: Explanation not found
- `500`: Internal server error

### User Plugin (`packages/backend-base/src/user/`)

#### GET /user/profile
**Response Schemas:**
- `200`: User profile data
  ```typescript
  { profile: UserProfileObject }
  ```
- `401`: Not authenticated
- `500`: Internal server error

#### PUT /user/profile
**Response Schemas:**
- `200`: Profile updated
  ```typescript
  { profile: UserProfileObject }
  ```
- `400`: Validation error
- `401`: Not authenticated
- `500`: Internal server error

#### GET /user/preferences
**Response Schemas:**
- `200`: User preferences
  ```typescript
  { preferences: PreferencesObject }
  ```
- `401`: Not authenticated
- `500`: Internal server error

#### PUT /user/preferences
**Response Schemas:**
- `200`: Preferences updated
  ```typescript
  { preferences: PreferencesObject }
  ```
- `400`: Validation error
- `401`: Not authenticated
- `500`: Internal server error

#### GET /user/notes
**Response Schemas:**
- `200`: List of user notes
  ```typescript
  { notes: NoteObject[], pagination: PaginationObject }
  ```
- `401`: Not authenticated
- `500`: Internal server error

#### POST /user/notes
**Response Schemas:**
- `201`: Note created
  ```typescript
  { note: NoteObject }
  ```
- `400`: Validation error
- `401`: Not authenticated
- `500`: Internal server error

#### DELETE /user/notes/:id
**Response Schemas:**
- `204`: Note deleted (no content)
- `401`: Not authenticated
- `404`: Note not found
- `500`: Internal server error

### Admin Plugin (`packages/backend-base/src/admin/`)

#### GET /admin/users
**Response Schemas:**
- `200`: List of users
  ```typescript
  { users: UserObject[], pagination: PaginationObject }
  ```
- `401`: Not authenticated
- `403`: Not admin
- `500`: Internal server error

#### GET /admin/users/:id
**Response Schemas:**
- `200`: User data
  ```typescript
  { user: UserObject }
  ```
- `401`: Not authenticated
- `403`: Not admin
- `404`: User not found
- `500`: Internal server error

#### PUT /admin/users/:id
**Response Schemas:**
- `200`: User updated
  ```typescript
  { user: UserObject }
  ```
- `400`: Validation error
- `401`: Not authenticated
- `403`: Not admin
- `404`: User not found
- `500`: Internal server error

#### DELETE /admin/users/:id
**Response Schemas:**
- `204`: User deleted (no content)
- `401`: Not authenticated
- `403`: Not admin
- `404`: User not found
- `500`: Internal server error

## Migration Strategy

### Error Handling Migration

**Before:**
```typescript
.get('/endpoint', async ({ error }) => {
  if (!resource) {
    return error(404, 'Resource not found')
  }
  // or
  throw new Error('Resource not found')
})
```

**After:**
```typescript
.get('/endpoint', async () => {
  if (!resource) {
    throw new NotFoundError('Resource not found')
  }
  return { data: resource }
}, {
  response: {
    200: t.Object({ data: ResourceSchema }),
    404: t.Ref('ErrorResponse'),
    500: t.Ref('ErrorResponse')
  }
})
```

## Response Schema Examples

### Successful Data Response

```typescript
{
  response: {
    200: t.Object({
      books: t.Array(t.Object({
        id: t.String(),
        name: t.String(),
        testament: t.String(),
        chapters: t.Number()
      }))
    }),
    500: t.Ref('ErrorResponse')
  }
}
```

### Authenticated Endpoint

```typescript
{
  response: {
    200: t.Object({ data: DataSchema }),
    401: t.Ref('ErrorResponse'),
    500: t.Ref('ErrorResponse')
  }
}
```

### Admin-Only Endpoint

```typescript
{
  response: {
    200: t.Object({ data: DataSchema }),
    401: t.Ref('ErrorResponse'),
    403: t.Ref('ErrorResponse'),
    500: t.Ref('ErrorResponse')
  }
}
```

### Create/Update Endpoints

```typescript
{
  response: {
    201: t.Object({ resource: ResourceSchema }),  // For POST
    400: t.Ref('ErrorResponse'),
    401: t.Ref('ErrorResponse'),
    500: t.Ref('ErrorResponse')
  }
}
```

## Controllers

No new controllers are required. All changes will be made to existing plugin route handlers:

- `packages/backend-base/src/auth/auth.plugin.ts`
- `packages/backend-base/src/bible/bible.plugin.ts`
- `packages/backend-base/src/user/user.plugin.ts`
- `packages/backend-base/src/admin/admin.plugin.ts`
