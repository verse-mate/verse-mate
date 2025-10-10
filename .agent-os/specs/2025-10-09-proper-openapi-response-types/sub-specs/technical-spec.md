# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-09-proper-openapi-response-types/spec.md

> Created: 2025-10-09
> Version: 1.0.0

## Technical Requirements

### Analysis Phase

1. **Identify All t.Any() Usage**
   - Search for `t.Any()` in all schema files:
     - `packages/backend-base/src/bible/schemas/bible-response.schema.ts`
     - `packages/backend-base/src/admin/schemas/admin-response.schema.ts`
   - Document which schemas need concrete type definitions

2. **Service Return Type Analysis**
   - For each `t.Any()` schema, trace back to the service method that generates the response
   - Analyze actual return types from:
     - `BibleService` methods (getBooks, getExplanation, getUserChatHistory, etc.)
     - `ChatService` methods (conversation history, message formats)
     - `AdminDatabaseService` methods
     - `AdminPromptService` methods
     - `BatchOperationService` methods

3. **Database Model Analysis**
   - Review database models in `packages/database/src/models/public/`
   - Understand entity structures for: Books, Chapters, Explanations, Notes, Bookmarks, Highlights, Users, Prompts, Batches
   - Identify enum types used in responses

### Implementation Strategy

1. **Create Proper Type Definitions**
   - Use `t.Object()` with explicit field definitions
   - Use `t.String()`, `t.Number()`, `t.Boolean()` for primitives
   - Use `t.Optional()` for nullable/undefined fields
   - Use `t.Union()` for enums and discriminated unions
   - Use `t.Array(t.Object(...))` for typed arrays
   - Use `t.Literal()` for constant values

2. **Bible Plugin Schemas** (`bible-response.schema.ts`)

   Current `t.Any()` usage to replace:
   - `BookSchema.books: t.Array(t.Any())` → Define Book object structure
   - `LanguagesSchema: t.Array(t.Any())` → Define Language object structure
   - `ChapterSchema: t.Any()` → Define Chapter object with verses array
   - `ExplanationSchema.explanation: t.Any()` → Define Explanation object structure
   - `TestamentsSchema.testaments: t.Any()` → Define Testament structure
   - `UserChatHistorySchema.userChatHistory: t.Any()` → Define grouped chat history object
   - `MessagesHistorySchema.messagesHistory: t.Array(t.Any())` → Define Message object
   - `NewConversationSchema.newConversation: t.Any()` → Define Conversation object
   - `SavedMessageSchema.result: t.Any()` → Define saved message structure
   - `RatingSaveSchema.result: t.Any()` → Define rating save result
   - `RatingsSchema` fields (userRating, totalUsersWhoRated, averageRating): Define proper types
   - `LastChapterReadSaveSchema.result: t.Any()` → Define save result
   - `LastChapterReadSchema.result: t.Any()` → Define last read data
   - `BookmarksSchema.favorites: t.Array(t.Any())` → Define Bookmark object
   - `NotesSchema.notes: t.Array(t.Any())` → Define Note object
   - `NoteAddSchema.note: t.Any()` → Define Note object
   - `HighlightsSchema.highlights: t.Array(t.Any())` → Define Highlight object
   - `HighlightAddSchema: t.Any()` → Define Highlight object
   - `HighlightUpdateSchema.highlight: t.Any()` → Define Highlight object

3. **Admin Plugin Schemas** (`admin-response.schema.ts`)

   Current `t.Any()` usage to replace:
   - `LanguagesArraySchema: t.Array(t.Any())` → Define Language object
   - `StatsSchema: t.Any()` → Define statistics object structure
   - `UsersArraySchema: t.Array(t.Any())` → Define User object
   - `BatchOperationSchema: t.Any()` → Define batch operation result
   - `BatchHistorySchema: t.Any()` → Define batch history array structure
   - `BatchChildrenSchema: t.Any()` → Define batch children array
   - `BatchSummarySchema: t.Any()` → Define batch summary object
   - All Explanation-related schemas (Delete, Regenerate, Generate, Comparison, Choose, etc.)
   - All Prompt-related schemas (System, User, Create, Update, Delete, etc.)
   - `PlaygroundSchema: t.Any()` → Define playground test result
   - `ExistingExplanationSchema: t.Any()` → Define explanation data
   - `CommentaryGradesSchema.grades: t.Array(t.Any())` and `gradingCriteria: t.Array(t.Any())`

### Type Definition Examples

```typescript
// Before
export const BookSchema = t.Object({
  books: t.Array(t.Any()),
});

// After
export const BookSchema = t.Object({
  books: t.Array(t.Object({
    bookId: t.Number(),
    name: t.String(),
    testament: t.Union([t.Literal("OT"), t.Literal("NT"), t.Null()]),
    genre: t.Object({
      n: t.String(),
      g: t.String(),
    }),
    chapters: t.Number(),
  })),
});
```

```typescript
// Before
export const UserChatHistorySchema = t.Object({
  userChatHistory: t.Any(),
});

// After
export const UserChatHistorySchema = t.Object({
  userChatHistory: t.Object({
    today: t.Optional(t.Array(ConversationSchema)),
    yesterday: t.Optional(t.Array(ConversationSchema)),
    lastSevenDays: t.Optional(t.Array(ConversationSchema)),
    older: t.Optional(t.Array(ConversationSchema)),
  }),
});
```

### Testing Requirements

1. **Type Validation**
   - All TypeScript compilation must succeed
   - No type errors in plugin files
   - Service return types must match schema definitions

2. **Runtime Validation**
   - All existing tests must pass
   - Eden Treaty client type inference improves
   - OpenAPI spec generation succeeds

3. **Documentation Verification**
   - Visit `/openapi/json` endpoint
   - Verify all response schemas show concrete types (no "any" or generic objects)
   - Check that nested structures are properly represented

### Implementation Order

1. Start with simpler schemas (primitives and small objects)
2. Create reusable sub-schemas for common structures (Book, User, Message, etc.)
3. Progress to complex nested structures (chat history, batch operations)
4. Verify each schema change with corresponding tests
5. Final verification of OpenAPI spec quality

## Approach

The implementation will be systematic and methodical:

1. **Discovery Phase**: Analyze all `t.Any()` usage and trace to actual service return types
2. **Schema Design**: Create proper type definitions based on actual data structures
3. **Incremental Implementation**: Replace `t.Any()` one schema at a time with proper types
4. **Continuous Testing**: Run tests after each change to ensure no regressions
5. **Verification**: Review OpenAPI spec output to confirm quality improvements

## External Dependencies

No new external dependencies required. This work uses existing Elysia type system utilities.
