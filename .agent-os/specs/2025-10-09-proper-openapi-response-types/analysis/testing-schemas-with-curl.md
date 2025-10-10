# Testing Response Schemas with curl

**Date**: 2025-10-10
**Purpose**: Verify that Elysia response schemas accurately match actual API responses

## Why Test with curl?

When replacing `t.Any()` with concrete types, it's critical to verify that:
1. The schema matches what the service **actually returns** (not what we think it should return)
2. All fields are present and correctly typed
3. Nullable/optional fields are handled properly
4. No TypeScript compilation errors occur

Testing with curl allows us to see the actual JSON response and compare it to our schema definition.

## Testing Workflow

### Step 1: Start the Backend Server

```bash
cd apps/backend
bun run dev
```

The backend should start on port 3001 (default).

### Step 2: Test Endpoint with curl

```bash
# Basic GET request
curl http://localhost:3001/bible/testaments | jq

# GET with query parameters
curl "http://localhost:3001/bible/book/1/1?versionKey=NASB1995" | jq

# POST with JSON body
curl -X POST http://localhost:3001/bible/book/conversations-history \
  -H "Content-Type: application/json" \
  -d '{"session":{"id":"test-user-id"}}' | jq
```

**Note**: `| jq` formats the JSON output for readability. Install jq with `brew install jq` if needed.

### Step 3: Compare Response to Schema

Compare the actual JSON structure to the Elysia schema definition:

**Example**:

```typescript
// Schema definition
export const TestamentsSchema = t.Object({
  testaments: t.Array(BookTypeCompact),
});

// Where BookTypeCompact is:
export const BookTypeCompact = t.Object({
  b: t.Number(),
  n: t.String(),
  t: TestamentEnum,
  g: t.String(),
  c: t.Number(),
});
```

**Expected curl response**:
```json
{
  "testaments": [
    {
      "b": 1,
      "n": "Genesis",
      "t": "OT",
      "g": "Law",
      "c": 50
    },
    ...
  ]
}
```

### Step 4: Fix Mismatches

If the response doesn't match:
1. Update the schema to match the actual response
2. OR fix the service/endpoint to return the correct structure
3. Re-test with curl
4. Verify TypeScript compilation passes

## Common Test Cases for Phase 2

### 1. Test Testaments Endpoint

```bash
curl http://localhost:3001/bible/testaments | jq
```

**Expected structure**:
```json
{
  "testaments": [
    { "b": 1, "n": "Genesis", "t": "OT", "g": "Law", "c": 50 },
    { "b": 2, "n": "Exodus", "t": "OT", "g": "Law", "c": 40 },
    ...
  ]
}
```

**Schema**: `TestamentsSchema`

### 2. Test Languages Endpoint

```bash
curl http://localhost:3001/bible/languages | jq
```

**Expected structure**:
```json
[
  {
    "language_code": "en",
    "name": "English",
    "native_name": "English",
    "explanation_count": 1234
  },
  ...
]
```

**Schema**: `LanguagesSchema` (note: returns array directly, not wrapped in object)

### 3. Test Books Endpoint

```bash
curl http://localhost:3001/bible/books | jq | head -50
```

**Expected structure**:
```json
{
  "books": [
    {
      "bookId": 1,
      "name": "Genesis",
      "testament": "OT",
      "genre": { "g": 1, "n": "Law" },
      "chapters": [
        {
          "chapterId": 1,
          "subtitles": [...],
          "verses": [...]
        }
      ]
    }
  ]
}
```

**Schema**: `BookSchema`

### 4. Test Chapter Endpoint

```bash
curl "http://localhost:3001/bible/book/1/1?versionKey=NASB1995" | jq '.book | keys'
```

**Expected structure**:
```json
{
  "book": {
    "bookId": 1,
    "name": "Genesis",
    "testament": "OT",
    "genre": { "g": 1, "n": "Law" },
    "chapters": [...]
  }
}
```

Or if chapter not found:
```json
{
  "message": "Chapter not found"
}
```

**Schema**: `ChapterSchema`

### 5. Test Explanation Endpoint (requires auth)

```bash
# This endpoint requires authentication
curl http://localhost:3001/bible/book/explanation/1/1 \
  -H "Authorization: Bearer <token>" | jq
```

**Expected structure**:
```json
{
  "explanation": {
    "explanation_id": 123,
    "chapter_id": 1,
    "explanation_type": "summary",
    "explanation_text": "...",
    "language_id": 1,
    "is_active": true,
    "version": 1,
    "parent_explanation_id": null,
    "created_at": "2025-10-10T12:34:56.789Z"
  }
}
```

**Schema**: `ExplanationSchema`

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

### Server Won't Start

Check environment variables:
```bash
cd apps/backend
cat .env.example
# Ensure .env file exists with required variables
```

### 404 Not Found

Verify the endpoint path matches the route definition in `bible.plugin.ts`:
- `/bible/testaments` ✅
- `/testaments` ❌ (missing /bible prefix)

### Authentication Required

Some endpoints require authentication. Check the endpoint definition for `.resolve(authDerive)` which indicates auth is required.

For testing, you may need to:
1. Create a test user
2. Get an auth token
3. Include `Authorization: Bearer <token>` header

## Integration with Schema Verification

After testing with curl and confirming the response structure:

1. **Update Schema**: Ensure the Elysia schema matches the curl response exactly
2. **Run TypeScript Check**: `bunx tsc --noEmit` to catch type mismatches
3. **Run Biome**: `bunx biome check --write src/` to format and lint
4. **Commit Changes**: Once verified, commit the schema updates

## Quick Reference

```bash
# Start backend
cd apps/backend && bun run dev

# Test all Phase 2 endpoints
curl http://localhost:3001/bible/testaments | jq
curl http://localhost:3001/bible/languages | jq
curl http://localhost:3001/bible/books | jq | head -50
curl "http://localhost:3001/bible/book/1/1" | jq '.book | keys'

# Check OpenAPI spec
curl http://localhost:3001/openapi/json | jq '.paths' > openapi-paths.json
```

## Benefits

✅ **Accuracy**: See actual responses, not assumed structures
✅ **Speed**: Faster than running full test suite
✅ **Debugging**: Easy to identify field name mismatches
✅ **Documentation**: Responses serve as examples
✅ **Confidence**: Know schemas are correct before committing

## Best Practices

1. **Test before implementing**: curl the endpoint first, then write the schema
2. **Save responses**: Keep sample responses for reference during implementation
3. **Test edge cases**: Try with missing data, invalid IDs, etc.
4. **Verify nullability**: Check endpoints that might return null values
5. **Test all variants**: If endpoint has query params, test different combinations
