# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-09-replace-tany-with-proper-types/spec.md

> Created: 2025-10-09
> Version: 1.0.0

## Current State Analysis

### Files with t.Any() Usage

**bible.plugin.ts**: 22 instances
- Lines 62, 65, 67, 70, 74, 82, 86, 94, 99, 103, 107, 109, 113, 117, 121, 125, 133, 137, 142, 162, 168, 177

**admin.plugin.ts**: 22 instances
- Lines 33, 64, 66, 68, 70, 72, 85, 92, 94, 96, 99, 103, 105, 107, 116, 118, 120, 122, 124, 126, 130, 134

### Impact on Type Safety

**Current Problems:**
1. Eden Treaty client receives `any` type for all these responses
2. OpenAPI schema shows generic `{}` objects
3. No compile-time validation of response structures
4. No IDE autocomplete for response fields
5. Runtime errors only when accessing non-existent fields

**After Fix:**
1. Eden Treaty gets accurate TypeScript types
2. OpenAPI schema shows complete field definitions
3. TypeScript catches schema mismatches at compile time
4. Full IDE autocomplete and type checking
5. Runtime validation enforces schema compliance

## Technical Requirements

### Phase 1: Analyze Actual Response Structures

For each `t.Any()`, determine the actual data structure by:
1. Reading the service/repository method that generates the response
2. Examining database query results
3. Checking existing TypeScript interfaces if available
4. Running the API endpoint and inspecting actual responses

### Phase 2: Create Reusable Type Schemas

Define common TypeBox schemas in separate files for reuse:

**packages/backend-base/src/bible/schemas/response-types.ts:**
```typescript
import { t } from "elysia";

// Book structure from Bible JSON data
export const BookSchema = t.Object({
  bookId: t.Number(),
  name: t.String(),
  testament: t.Union([t.Literal("OT"), t.Literal("NT"), t.Null()]),
  genre: t.Object({
    n: t.String(),
    i: t.String(),
  }),
  chapters: t.Array(t.Object({
    chapterNumber: t.Number(),
    verses: t.Array(t.Object({
      verseNumber: t.Number(),
      text: t.String(),
    })),
  })),
});

// Language structure
export const LanguageSchema = t.Object({
  language_code: t.String(),
  name: t.String(),
  native_name: t.String(),
  explanation_count: t.Number(),
});

// User structure
export const UserSchema = t.Object({
  id: t.String({ format: "uuid" }),
  email: t.String({ format: "email" }),
  firstName: t.String(),
  lastName: t.String(),
  is_admin: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
});

// Bookmark structure
export const BookmarkSchema = t.Object({
  id: t.Number(),
  user_id: t.String({ format: "uuid" }),
  book_id: t.Number(),
  chapter_number: t.Number(),
  created_at: t.String({ format: "date-time" }),
});

// Note structure
export const NoteSchema = t.Object({
  id: t.String({ format: "uuid" }),
  user_id: t.String({ format: "uuid" }),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_id: t.Union([t.Number(), t.Null()]),
  content: t.String(),
  created_at: t.String({ format: "date-time" }),
  updated_at: t.String({ format: "date-time" }),
});

// Highlight structure
export const HighlightSchema = t.Object({
  id: t.Number(),
  user_id: t.String({ format: "uuid" }),
  chapter_id: t.Number(),
  start_verse: t.Number(),
  end_verse: t.Number(),
  color: t.String(),
  start_char: t.Union([t.Number(), t.Null()]),
  end_char: t.Union([t.Number(), t.Null()]),
  selected_text: t.Union([t.String(), t.Null()]),
  created_at: t.String({ format: "date-time" }),
});

// Chat/Conversation structure
export const ConversationSchema = t.Object({
  id: t.Number(),
  user_id: t.String({ format: "uuid" }),
  title: t.String(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  created_at: t.String({ format: "date-time" }),
  is_active: t.Boolean(),
});

// Message structure
export const MessageSchema = t.Object({
  id: t.Number(),
  conversation_id: t.Number(),
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String(),
  created_at: t.String({ format: "date-time" }),
});

// Explanation structure
export const ExplanationSchema = t.Object({
  id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  version_id: t.Number(),
  type: t.String(),
  explanation: t.String(),
  created_at: t.String({ format: "date-time" }),
});

// Rating structure
export const RatingSchema = t.Object({
  id: t.Number(),
  user_id: t.String({ format: "uuid" }),
  explanation_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  rating: t.Number({ minimum: 1, maximum: 5 }),
  created_at: t.String({ format: "date-time" }),
});
```

**packages/backend-base/src/admin/schemas/response-types.ts:**
```typescript
import { t } from "elysia";
import { UserSchema } from "../../bible/schemas/response-types";

// Batch operation structure
export const BatchJobSchema = t.Object({
  id: t.String(),
  name: t.String(),
  data: t.Object({
    type: t.String(),
    book_id: t.Union([t.Number(), t.Null()]),
    chapter_number: t.Union([t.Number(), t.Null()]),
    explanation_types: t.Array(t.String()),
    model: t.String(),
    user_id: t.String({ format: "uuid" }),
  }),
  opts: t.Object({
    priority: t.Number(),
  }),
  progress: t.Number(),
  returnvalue: t.Union([t.Any(), t.Null()]), // May need investigation
  failedReason: t.Union([t.String(), t.Null()]),
  timestamp: t.Number(),
  processedOn: t.Union([t.Number(), t.Null()]),
  finishedOn: t.Union([t.Number(), t.Null()]),
});

// Prompt structure
export const PromptSchema = t.Object({
  id: t.Number(),
  prompt: t.String(),
  status: t.Union([
    t.Literal("active"),
    t.Literal("inactive"),
    t.Literal("archived"),
  ]),
  created_at: t.String({ format: "date-time" }),
  updated_at: t.String({ format: "date-time" }),
  type: t.Union([t.Literal("system"), t.Literal("user")]),
  user_id: t.Union([t.String({ format: "uuid" }), t.Null()]),
});

// Stats structure (needs investigation)
export const StatsSchema = t.Object({
  total_users: t.Number(),
  total_explanations: t.Number(),
  total_conversations: t.Number(),
  total_ratings: t.Number(),
  average_rating: t.Number(),
});

// Grade structure
export const GradeSchema = t.Object({
  chapter_id: t.Number(),
  book_name: t.String(),
  chapter_number: t.Number(),
  grade: t.Number(),
  feedback: t.String(),
  criteria_scores: t.Object({
    accuracy: t.Number(),
    clarity: t.Number(),
    completeness: t.Number(),
  }),
});
```

### Phase 3: Replace t.Any() Instances

**Bible Plugin Replacements:**

```typescript
// Before
const BooksResponse = t.Object({
  books: t.Array(t.Any()),
});

// After
const BooksResponse = t.Object({
  books: t.Array(BookSchema),
});

// Before
const LanguagesResponse = t.Array(t.Any());

// After
const LanguagesResponse = t.Array(LanguageSchema);

// Before
const BookResponse = t.Any();

// After
const BookResponse = BookSchema;

// Before
const ExplanationResponse = t.Object({
  explanation: t.Any(),
});

// After
const ExplanationResponse = t.Object({
  explanation: t.Union([
    t.Array(ExplanationSchema),
    t.Null(),
  ]),
});

// Before
const UserChatHistoryResponse = t.Object({
  userChatHistory: t.Any(),
});

// After
const UserChatHistoryResponse = t.Object({
  userChatHistory: t.Array(ConversationSchema),
});

// Before
const MessagesHistoryResponse = t.Object({
  messagesHistory: t.Any(),
});

// After
const MessagesHistoryResponse = t.Object({
  messagesHistory: t.Array(MessageSchema),
});

// Before
const BookmarksResponse = t.Object({
  favorites: t.Array(t.Any()),
});

// After
const BookmarksResponse = t.Object({
  favorites: t.Array(BookmarkSchema),
});

// Before
const NotesResponse = t.Object({
  notes: t.Array(t.Any()),
});

// After
const NotesResponse = t.Object({
  notes: t.Array(NoteSchema),
});

// Before
const AddNoteResponse = t.Object({
  success: t.Boolean(),
  note: t.Optional(t.Any()),
});

// After
const AddNoteResponse = t.Object({
  success: t.Boolean(),
  note: t.Optional(NoteSchema),
});

// Before
const HighlightsResponse = t.Object({
  highlights: t.Array(t.Any()),
});

// After
const HighlightsResponse = t.Object({
  highlights: t.Array(HighlightSchema),
});

// Before
const AddHighlightResponse = t.Union([
  t.Object({
    success: t.Boolean(),
    highlight: t.Optional(t.Any()),
  }),
  // ...
]);

// After
const AddHighlightResponse = t.Union([
  t.Object({
    success: t.Boolean(),
    highlight: t.Optional(HighlightSchema),
  }),
  // ...
]);

// For result fields that could be various types, investigate actual structure:
// Before
const SaveRatingResponse = t.Object({
  result: t.Any(),
});

// After (need to check what saveRating actually returns)
const SaveRatingResponse = t.Object({
  result: RatingSchema, // or appropriate type
});
```

**Admin Plugin Replacements:**

```typescript
// Before
const UsersListResponse = t.Array(t.Any());

// After
const UsersListResponse = t.Array(UserSchema);

// Before
const BatchListResponse = t.Array(t.Any());

// After
const BatchListResponse = t.Array(BatchJobSchema);

// Before
const SystemPromptsListResponse = t.Array(t.Any());

// After
const SystemPromptsListResponse = t.Array(PromptSchema);

// Before
const StatsResponse = t.Any();

// After
const StatsResponse = StatsSchema;

// Before
const CommentaryGradesResponse = t.Object({
  message: t.String(),
  grades: t.Array(t.Any()),
  stats: t.Object({
    total: t.Number(),
    averageGrade: t.Number(),
    gradingCriteria: t.Array(t.Any()),
  }),
});

// After
const CommentaryGradesResponse = t.Object({
  message: t.String(),
  grades: t.Array(GradeSchema),
  stats: t.Object({
    total: t.Number(),
    averageGrade: t.Number(),
    gradingCriteria: t.Array(t.String()), // or appropriate structure
  }),
});
```

### Phase 4: Handle Unknown/Dynamic Structures

For truly dynamic responses where structure isn't known at compile time:
1. Investigate if structure can be determined
2. Create union types for known variations
3. Use `t.Record()` for key-value maps
4. Only use `t.Any()` as absolute last resort with documentation explaining why

Example:
```typescript
// If batch data structure varies by job type
const BatchDataSchema = t.Union([
  t.Object({ type: t.Literal("explanation"), /* ... */ }),
  t.Object({ type: t.Literal("translation"), /* ... */ }),
  t.Record(t.String(), t.Unknown()), // Fallback for unknown types
]);
```

### Phase 5: Verification

**Type Check:**
```bash
bunx tsc --noEmit
# Expected: No new errors
```

**Test Suite:**
```bash
bun test
# Expected: 30 pass, 13 skip, 0 fail
```

**OpenAPI Schema Inspection:**
```bash
curl http://localhost:3001/openapi | jq '.paths."/bible/books".get.responses."200".content."application/json".schema'
# Should show detailed book structure, not generic object
```

**Eden Treaty Type Check:**
```typescript
// In frontend, verify type inference works
const { data } = await api.bible.books.get();
// data.books should be typed, not any
// IDE should show autocomplete for book properties
```

## Implementation Strategy

### Step-by-Step Approach

1. **Create schema definition files** (response-types.ts in both modules)
2. **Start with Bible plugin simple types** (BookmarkSchema, LanguageSchema)
3. **Test each replacement individually** (compile + test)
4. **Move to complex types** (nested structures, unions)
5. **Repeat for Admin plugin**
6. **Validate OpenAPI output**
7. **Verify Eden Treaty types**

### Testing After Each Change

```bash
# After each schema replacement:
bunx tsc --noEmit && bun test
```

### Rollback Plan

If a schema replacement causes issues:
```bash
git checkout packages/backend-base/src/bible/bible.plugin.ts
# Or revert specific lines
```

## External Dependencies

No new external dependencies required. Using existing TypeBox (`t`) from Elysia.

## Success Metrics

✅ Zero `t.Any()` instances in bible.plugin.ts
✅ Zero `t.Any()` instances in admin.plugin.ts
✅ All TypeScript compilation passes
✅ All 30 tests passing
✅ OpenAPI schema shows detailed types (not `{}`)
✅ Eden Treaty client has type inference
✅ No runtime errors from schema validation

## Risk Assessment

**Low Risk:**
- Breaking existing functionality (tests catch regressions)
- Performance impact (schema definition doesn't affect runtime)

**Medium Risk:**
- Incorrect schema definitions (need careful investigation of actual structures)
- Schema validation rejecting valid responses (if schema too strict)

**Mitigation:**
- Test thoroughly after each replacement
- Inspect actual API responses to ensure schemas match
- Use optional fields (`t.Optional()`) where data might be missing
- Use unions (`t.Union()`) for fields with multiple possible types
