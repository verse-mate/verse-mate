# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-06-backend-test-coverage/spec.md

## Technical Requirements

### Current Coverage Baseline (from `bun test --coverage`)
- **Overall**: 63.81% functions, 74.43% lines
- **Well-covered**: auth.plugin.ts (88.46% funcs), user.plugin.ts (87.50% funcs)
- **Zero coverage**: bible.plugin.ts (0%), admin.plugin.ts (0%), healthcheck.plugin.ts (0%)
- **Missing coverage**: prompt.repository.ts (0%), batch-operations.service.ts (0%)

### Test Framework & Patterns
- Use existing Bun test framework (`bun test --coverage`)
- Follow patterns established in `auth.test.ts` and `user.test.ts`
- Use Elysia test client via `getTestClient` helper
- Use `@faker-js/faker` for generating test data
- Leverage existing test database setup and teardown patterns

### Test File Organization
- Create `packages/backend-base/src/healthcheck/healthcheck.test.ts`
- Expand `packages/backend-base/src/user/user.test.ts`
- Create `packages/backend-base/src/bible/bible.test.ts`
- Create `packages/backend-base/src/admin/admin.test.ts`

### Database Test Data Setup
- Reuse existing test user creation from auth.test.ts pattern
- Seed minimal test data for bible books/chapters using existing seeds
- Create test bookmarks, notes, highlights for each test case
- Clean up test data after each test using proper teardown

### Authentication Handling
- Follow existing auth pattern: signup → login → get token → use in requests
- Store auth token in test context for reuse across test cases
- Test both authenticated and unauthenticated access where applicable

### Endpoint Testing Priority

**Phase 1 - Healthcheck (3 endpoints):**
- `GET /health` - Overall health status
- `GET /health/database` - Database connection check
- `GET /health/cache` - Redis connection check

**Phase 2 - User Plugin Completion (1 endpoint):**
- `GET /user` - List all users endpoint

**Phase 3 - Bible CRUD (~20 endpoints):**
- Bookmarks: GET list, POST add, DELETE remove
- Notes: GET list, POST add, PUT update, DELETE remove
- Highlights: GET all, GET by chapter, POST add, PUT update color, DELETE remove
- Ratings: POST save, PUT update, POST get stats

**Phase 4 - Bible Queries (~5 endpoints):**
- `GET /bible/books` - Static book list
- `GET /bible/languages` - Available languages
- `GET /bible/testaments` - Testament list
- `GET /bible/chapter-id/:bookId/:chapterNumber` - Chapter ID lookup
- `POST /bible/book/conversation-exists` - Chat existence check

**Phase 5 - Admin CRUD (~18 endpoints):**
- User management: GET users list, PATCH preferences, PATCH admin status
- Prompts: GET system/user prompts, POST create, PUT update, DELETE remove, PUT status, POST restore defaults
- Batch history: GET batch history, GET children, GET summary

### Testing Approach Per Endpoint Type

**Simple GET endpoints (no auth):**
```typescript
test("GET /bible/books returns book list", async () => {
  const response = await client.bible.books.get();
  expect(response.error).toBeFalsy();
  expect(response.data).toBeTruthy();
  expect(Array.isArray(response.data)).toBe(true);
});
```

**CRUD endpoints with auth:**
```typescript
test("POST /bible/book/bookmark/add creates bookmark", async () => {
  // Setup: create test user and login
  const { token, userId } = await createAuthenticatedUser();

  // Test: add bookmark
  const response = await client.bible.book.bookmark.add.post({
    user_id: userId,
    book_id: 1,
    chapter_number: 1
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });

  expect(response.error).toBeFalsy();
  expect(response.data).toBeTruthy();

  // Verify: bookmark exists
  const bookmarks = await client.bible.book.bookmarks[userId].get();
  expect(bookmarks.data.length).toBeGreaterThan(0);
});
```

**Endpoints with validation:**
```typescript
test("POST /bible/book/bookmark/add validates required fields", async () => {
  const { token } = await createAuthenticatedUser();

  const response = await client.bible.book.bookmark.add.post({
    user_id: "invalid-uuid"
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });

  expect(response.error).toBeTruthy();
  expect(response.status).toBe(400);
});
```

### Success Criteria
- All new tests pass locally with `bun test`
- All new tests pass in CI/CD pipeline
- No new external dependencies required
- Tests complete in reasonable time (<5 seconds per file)
- Coverage improvements (verified with `bun test --coverage`):
  - Overall functions: 63.81% → 75-80%
  - Overall lines: 74.43% → 80-85%
  - bible.plugin.ts: 0% → 60%+
  - admin.plugin.ts: 0% → 50%+
  - healthcheck.plugin.ts: 0% → 100%

## External Dependencies

No new external dependencies required. All testing will use existing packages:
- `bun:test` - Built-in Bun test framework
- `@faker-js/faker` - Already used for test data generation
- `elysia` - Already provides test client utilities
