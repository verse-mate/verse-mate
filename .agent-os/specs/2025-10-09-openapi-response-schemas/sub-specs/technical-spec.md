# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-09-openapi-response-schemas/spec.md

## Technical Requirements

### Response Schema Pattern Implementation

**Approach**: Add explicit `response` parameter to all endpoint handlers following the Elysia TypeScript schema pattern:

```typescript
.get(
  "/endpoint",
  async ({ store }): Promise<ReturnType> => {
    // handler logic
    return result;
  },
  {
    response: {
      200: t.Object({ field: t.String() }),
      400: t.Object({
        message: t.String(),
        data: t.Any(),
      }),
      500: t.Object({
        message: t.String(),
        data: t.Any(),
      }),
    },
  },
)
```

**Key Elements**:
- Status code keys (200, 400, 500) mapped to Elysia `t` type definitions
- Success responses (200) use exact type schemas matching return structures
- Error responses (400, 500) standardized to `{ message: string, data: any }`
- TypeScript return type annotations maintained for Eden Treaty compatibility

### Affected Plugin Files

All endpoint handlers in the following plugin files require response schema definitions:

1. **packages/backend-base/src/auth/auth.plugin.ts**
   - `/auth/user` (GET) - returns `{ id: string | null }`
   - `/auth/change-password` (POST) - returns `boolean`
   - `/auth/logout` (POST) - returns `boolean`
   - `/auth/logout-all` (POST) - returns `boolean`
   - `/auth/send-email-verification` (POST) - returns `undefined` (204)
   - `/auth/verify-email` (POST) - returns `AuthPayload`
   - `/auth/session` (GET) - returns user object
   - `/auth/profile` (PUT) - returns user object
   - `/auth/signup` (POST) - returns `AuthPayload`
   - `/auth/login` (POST) - returns `AuthPayload`
   - `/auth/forgot-password` (POST) - returns `{ success: boolean }`
   - `/auth/reset-password` (POST) - returns `{ success: boolean }`
   - `/auth/reset-password-verify` (GET) - returns `{ success: boolean }`

2. **packages/backend-base/src/user/user.plugin.ts**
   - `/user` (GET) - returns array of users
   - `/user/me` (GET) - returns `User` entity
   - `/user/update` (POST) - returns `boolean`

3. **packages/backend-base/src/bible/bible.plugin.ts** (extensive - 30+ endpoints)
   - `/bible/books` (GET)
   - `/bible/languages` (GET)
   - `/bible/book/:bookId/:chapterNumber` (GET)
   - `/bible/book/explanation/:bookId/:chapterNumber` (GET)
   - `/bible/testaments` (GET)
   - `/bible/chapter-id/:bookId/:chapterNumber` (GET)
   - `/bible/book/conversations-history` (POST)
   - `/bible/book/messages-history` (POST)
   - `/bible/book/conversation-exists` (POST)
   - `/bible/book/new-conversation` (POST)
   - `/bible/book/explanation/save-rating` (POST)
   - `/bible/book/explanation/update-rating` (PUT)
   - `/bible/book/explanation/ratings` (POST)
   - `/bible/book/chapter/save-last-read` (POST)
   - `/bible/book/chapter/last-read` (POST)
   - `/bible/book/ask-verse-mate/save-user-message` (POST)
   - `/bible/book/ask-verse-mate/save-ai-message` (POST)
   - `/bible/book/delete-chat/:conversation_id` (DELETE)
   - `/bible/book/bookmarks/:user_id` (GET)
   - `/bible/book/notes/:user_id` (GET)
   - `/bible/book/note/add` (POST)
   - `/bible/book/note/update` (PUT)
   - `/bible/book/note/remove` (DELETE)
   - `/bible/book/bookmark/add` (POST)
   - `/bible/book/bookmark/remove` (DELETE & POST)
   - `/bible/highlights/:user_id` (GET)
   - `/bible/highlights/:user_id/:book_id/:chapter_number` (GET)
   - `/bible/highlight/add` (POST)
   - `/bible/highlight/:highlight_id` (PUT)
   - `/bible/highlight/:highlight_id` (DELETE)

4. **packages/backend-base/src/admin/admin.plugin.ts** (needs investigation)

5. **packages/backend-base/src/healthcheck/healthcheck.plugin.ts** (likely simple health check)

### Shared Type Definitions

Create a shared response schema file to reduce duplication:

**Location**: `packages/backend-base/src/common/response-schemas.ts`

**Contents**:
```typescript
import { t } from "elysia";

export const ErrorResponse = t.Object({
  message: t.String(),
  data: t.Any(),
});

export const StandardErrorResponses = {
  400: ErrorResponse,
  500: ErrorResponse,
};

export const BooleanResponse = t.Boolean();

export const SuccessResponse = t.Object({
  success: t.Boolean(),
});
```

**Usage Pattern**:
```typescript
import { StandardErrorResponses, BooleanResponse } from "../common/response-schemas";

.post(
  "/logout",
  async ({ bearer, store, jwt }): Promise<boolean> => {
    // logic
  },
  {
    response: {
      200: BooleanResponse,
      ...StandardErrorResponses,
    },
  },
)
```

### Entity Type Schemas

Create Elysia schema definitions for complex entity types returned by endpoints:

**Location**: `packages/backend-base/src/auth/schemas/auth-response.schema.ts`

**Example**:
```typescript
import { t } from "elysia";

export const AuthPayloadSchema = t.Object({
  token: t.String(),
  user: t.Object({
    id: t.String({ format: "uuid" }),
    email: t.String({ format: "email" }),
    firstName: t.String(),
    lastName: t.String(),
    emailVerified: t.Boolean(),
    // ... other user fields
  }),
});
```

Similar schema files needed for:
- `packages/backend-base/src/user/schemas/user-response.schema.ts` - User entity
- `packages/backend-base/src/bible/schemas/bible-response.schema.ts` - Book, Chapter, Verse, Explanation, Chat entities

### OpenAPI Documentation Configuration

Verify that the OpenAPI plugin in `apps/backend/src/index.ts` is properly configured with `@elysiajs/openapi`:

```typescript
import { openapi } from "@elysiajs/openapi";

const app = new Elysia()
  .use(openapi({
    documentation: {
      info: {
        title: "VerseMate API Documentation",
        version: "1.0.0",
        description: "Bible reading platform API with AI-driven translations",
      },
      servers: [
        { url: "http://localhost:3001", description: "Development server" },
        { url: "https://api.versemate.com", description: "Production server" },
      ],
    },
  }))
  .use(authPlugin)
  .use(biblePlugin)
  .use(userPlugin)
  .use(adminPlugin);
```

### Implementation Strategy

1. **Phase 1 - Shared Infrastructure** (1-2 hours)
   - Create `packages/backend-base/src/common/response-schemas.ts` with reusable error and success schemas
   - Document pattern in CLAUDE.md

2. **Phase 2 - Entity Schemas** (2-3 hours)
   - Create response schema files for each plugin (auth, user, bible, admin)
   - Define Elysia `t` schemas matching existing TypeScript entity types
   - Ensure schema fields match actual database return structures

3. **Phase 3 - Plugin Updates** (6-8 hours)
   - Update auth.plugin.ts endpoints (~13 endpoints)
   - Update user.plugin.ts endpoints (~3 endpoints)
   - Update bible.plugin.ts endpoints (~30 endpoints)
   - Update admin.plugin.ts endpoints (unknown count)
   - Update healthcheck.plugin.ts endpoint (~1 endpoint)

4. **Phase 4 - Verification** (1-2 hours)
   - Run backend tests to ensure no breaking changes
   - Start backend server and access OpenAPI documentation endpoint
   - Verify response schemas appear correctly in OpenAPI spec
   - Test representative endpoints with curl/Postman to validate schema accuracy
   - Run TypeScript compiler to verify Eden Treaty types still work

### Testing and Validation

**Backend Tests**:
```bash
cd packages/backend-base && bun test
```

**OpenAPI Spec Access**:
```bash
curl http://localhost:3001/openapi/json
```

**Sample Validation**:
```bash
# Test auth login endpoint
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  | jq .

# Verify response matches schema defined in response parameter
```

### Performance Considerations

- Response schema validation has minimal performance impact (Elysia optimizes at compile time)
- Schema definitions are type-only for OpenAPI generation, not runtime validation (unless explicitly enabled)
- No impact on existing Eden Treaty client or frontend functionality

### Compatibility Requirements

- **Eden Treaty Client**: Maintained through TypeScript return type annotations (unchanged)
- **OpenAPI Client**: Enhanced through explicit `response` parameter
- **Backend Tests**: May require updates if tests rely on exact error response structures
- **Frontend API Calls**: No changes required - Eden client continues to work as before

### Documentation Updates

**CLAUDE.md Additions**:

```markdown
### API Response Schemas

All backend endpoints define explicit response schemas using Elysia's `response` parameter:

```typescript
// Example endpoint with response schemas
.get(
  "/user/me",
  async ({ currentUserId, store: { userService } }): Promise<User> => {
    return await userService.findOne(currentUserId);
  },
  {
    response: {
      200: UserSchema,
      400: ErrorResponse,
      500: ErrorResponse,
    },
  },
)
```

**Shared Response Schemas**: Import from `packages/backend-base/src/common/response-schemas.ts`
- `ErrorResponse` - Standard error structure
- `StandardErrorResponses` - Spread for 400/500 errors
- `BooleanResponse` - Simple boolean returns
- `SuccessResponse` - `{ success: boolean }` structure

**Plugin Response Schemas**: Each plugin has entity schemas in its `schemas/` directory
- Auth: `packages/backend-base/src/auth/schemas/auth-response.schema.ts`
- User: `packages/backend-base/src/user/schemas/user-response.schema.ts`
- Bible: `packages/backend-base/src/bible/schemas/bible-response.schema.ts`
```

## External Dependencies (Not Required)

No new external dependencies are needed for this implementation. All required functionality is provided by:
- Existing `elysia` package (already installed)
- Existing `@elysiajs/openapi` plugin (already in use, serving at `/openapi` endpoint)
