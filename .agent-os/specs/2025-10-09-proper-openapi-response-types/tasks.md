# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-10-09-proper-openapi-response-types/spec.md

> Created: 2025-10-09
> Status: Ready for Implementation

## Tasks

### Phase 1: Analysis and Foundation

- [x] 1. Analyze Current Schema Usage and Create Reusable Type Definitions
  - [x] 1.1 Audit all schema files for `t.Any()` usage and document findings
  - [x] 1.2 Analyze service return types for BibleService, ChatService, AdminDatabaseService, BatchOperationService
  - [x] 1.3 Review database models to understand entity structures
  - [x] 1.4 Create reusable base type definitions for common entities (Book, User, Message, Conversation, etc.)
  - [x] 1.5 Define enum types (TestamentEnum, RoleEnum, StatusEnum, etc.) as Elysia schemas
  - [x] 1.6 Document type mapping strategy for complex nested objects
  - [x] 1.7 Verify TypeScript compilation with base type definitions

### Phase 2: Bible Plugin Response Schemas (Part 1 - Core Data)

- [ ] 2. Replace Books, Chapters, and Languages Schemas
  - [ ] 2.1 Define proper BookSchema with books array of Book objects (bookId, name, testament, genre, chapters)
  - [ ] 2.2 Define ChapterSchema with verses array and chapter metadata
  - [ ] 2.3 Define LanguagesSchema as array of Language objects
  - [ ] 2.4 Define TestamentsSchema with proper testament object structure
  - [ ] 2.5 Update bible.plugin.ts imports and verify endpoints still work
  - [ ] 2.6 Run tests for books, chapters, languages, testaments endpoints
  - [ ] 2.7 Verify OpenAPI spec shows concrete types for these endpoints

- [ ] 3. Replace Explanation and Rating Schemas
  - [ ] 3.1 Define ExplanationSchema.explanation with proper object structure (id, content, type, language, etc.)
  - [ ] 3.2 Define RatingSaveSchema.result with rating save response structure
  - [ ] 3.3 Define RatingsSchema with concrete types for userRating, totalUsersWhoRated, averageRating
  - [ ] 3.4 Update bible.plugin.ts for explanation and rating endpoints
  - [ ] 3.5 Run tests for explanation and rating endpoints
  - [ ] 3.6 Verify OpenAPI spec quality for explanation routes

### Phase 3: Bible Plugin Response Schemas (Part 2 - Chat & Conversations)

- [ ] 4. Replace Chat and Conversation Schemas
  - [ ] 4.1 Define ConversationSchema for individual conversation objects
  - [ ] 4.2 Define UserChatHistorySchema with grouped structure (today, yesterday, lastSevenDays, older)
  - [ ] 4.3 Define MessageSchema for chat message objects (message_id, role, content, timestamp)
  - [ ] 4.4 Define MessagesHistorySchema as array of Message objects
  - [ ] 4.5 Define NewConversationSchema.newConversation with conversation object
  - [ ] 4.6 Define SavedMessageSchema.result with message save response
  - [ ] 4.7 Define ChatExistsSchema (already has boolean, verify structure)
  - [ ] 4.8 Define DisabledChatSchema (already has disabledChat number, verify)
  - [ ] 4.9 Update bible.plugin.ts for all chat/conversation endpoints
  - [ ] 4.10 Run tests for chat functionality
  - [ ] 4.11 Verify OpenAPI spec for chat endpoints

### Phase 4: Bible Plugin Response Schemas (Part 3 - User Content)

- [ ] 5. Replace Notes, Bookmarks, and Highlights Schemas
  - [ ] 5.1 Define NoteSchema with proper fields (note_id, user_id, book_id, chapter_number, verse_id, content, created_at)
  - [ ] 5.2 Update NotesSchema.notes as array of Note objects
  - [ ] 5.3 Update NoteAddSchema.note with Note object
  - [ ] 5.4 Define BookmarkSchema with proper fields
  - [ ] 5.5 Update BookmarksSchema.favorites as array of Bookmark objects
  - [ ] 5.6 Define HighlightSchema with proper fields (highlight_id, user_id, book_id, chapter_number, start_verse, end_verse, color, etc.)
  - [ ] 5.7 Update HighlightsSchema.highlights as array of Highlight objects
  - [ ] 5.8 Update HighlightAddSchema to return Highlight object
  - [ ] 5.9 Update HighlightUpdateSchema.highlight with Highlight object
  - [ ] 5.10 Update bible.plugin.ts for notes, bookmarks, highlights endpoints
  - [ ] 5.11 Run tests for notes, bookmarks, highlights
  - [ ] 5.12 Verify OpenAPI spec for user content endpoints

- [ ] 6. Replace Last Chapter Read Schemas
  - [ ] 6.1 Define LastChapterReadSchema.result with proper last read data structure
  - [ ] 6.2 Define LastChapterReadSaveSchema.result with save response
  - [ ] 6.3 Update bible.plugin.ts for last chapter read endpoints
  - [ ] 6.4 Run tests for last chapter read functionality
  - [ ] 6.5 Verify OpenAPI spec quality

### Phase 5: Admin Plugin Response Schemas (Part 1 - Users & Languages)

- [ ] 7. Replace Users and Languages Schemas
  - [ ] 7.1 Define UserSchema for admin endpoints (id, email, firstName, lastName, is_admin, createdAt)
  - [ ] 7.2 Update UsersArraySchema as array of User objects
  - [ ] 7.3 Define LanguageSchema with language object structure
  - [ ] 7.4 Update LanguagesArraySchema as array of Language objects
  - [ ] 7.5 Update admin.plugin.ts for user and language endpoints
  - [ ] 7.6 Run tests for admin user management
  - [ ] 7.7 Verify OpenAPI spec for admin endpoints

### Phase 6: Admin Plugin Response Schemas (Part 2 - Batch Operations)

- [ ] 8. Replace Batch Operation Schemas
  - [ ] 8.1 Define BatchOperationSchema with batch result structure (batchJobId, status, etc.)
  - [ ] 8.2 Define BatchHistoryItemSchema for individual batch records
  - [ ] 8.3 Update BatchHistorySchema as array of BatchHistoryItem objects
  - [ ] 8.4 Define BatchChildSchema for child batch items
  - [ ] 8.5 Update BatchChildrenSchema as array of BatchChild objects
  - [ ] 8.6 Define BatchSummarySchema with summary statistics
  - [ ] 8.7 Update admin.plugin.ts for batch operation endpoints
  - [ ] 8.8 Run tests for batch operations
  - [ ] 8.9 Verify OpenAPI spec for batch endpoints

### Phase 7: Admin Plugin Response Schemas (Part 3 - Explanations & Prompts)

- [ ] 9. Replace Explanation Management Schemas
  - [ ] 9.1 Define ExplanationDeleteSchema with delete response structure
  - [ ] 9.2 Define ExplanationRegenerateSchema with regeneration result
  - [ ] 9.3 Define ExplanationGenerateSchema with generation result
  - [ ] 9.4 Define ExplanationComparisonSchema with comparison data
  - [ ] 9.5 Define ExplanationChooseSchema with choice confirmation
  - [ ] 9.6 Define ExplanationsBulkDeleteSchema with bulk operation result
  - [ ] 9.7 Define ExplanationsSetActiveSchema with activation result
  - [ ] 9.8 Define ExplanationHistorySchema with version history array
  - [ ] 9.9 Define ExplanationsFilterSchema with filtered results array
  - [ ] 9.10 Update admin.plugin.ts for explanation management endpoints
  - [ ] 9.11 Run tests for explanation management
  - [ ] 9.12 Verify OpenAPI spec quality

- [ ] 10. Replace Prompt Management Schemas
  - [ ] 10.1 Define SystemPromptSchema with prompt object structure
  - [ ] 10.2 Update SystemPromptsSchema as array of SystemPrompt objects
  - [ ] 10.3 Define UserPromptSchema with user prompt structure
  - [ ] 10.4 Update UserPromptsSchema as array of UserPrompt objects
  - [ ] 10.5 Define ExplanationTypeSchema
  - [ ] 10.6 Update ExplanationTypesSchema as array of ExplanationType objects
  - [ ] 10.7 Define PromptCreateSchema with creation result
  - [ ] 10.8 Define PromptUpdateSchema with update confirmation
  - [ ] 10.9 Define PromptDeleteSchema with deletion confirmation
  - [ ] 10.10 Define PromptStatusUpdateSchema with status change result
  - [ ] 10.11 Define RestoreDefaultsSchema with restoration result
  - [ ] 10.12 Update admin.plugin.ts for prompt endpoints
  - [ ] 10.13 Run tests for prompt management
  - [ ] 10.14 Verify OpenAPI spec for prompt endpoints

### Phase 8: Admin Plugin Response Schemas (Part 4 - Stats & Playground)

- [ ] 11. Replace Statistics and Playground Schemas
  - [ ] 11.1 Define StatsSchema with statistics object structure (counts, averages, etc.)
  - [ ] 11.2 Define PlaygroundSchema with test result structure
  - [ ] 11.3 Define ExistingExplanationSchema with explanation data
  - [ ] 11.4 Update CommentaryGradesSchema.grades as array of Grade objects
  - [ ] 11.5 Define GradingCriteriaSchema
  - [ ] 11.6 Update CommentaryGradesSchema.gradingCriteria as array of criteria
  - [ ] 11.7 Update admin.plugin.ts for stats and playground endpoints
  - [ ] 11.8 Run tests for stats and playground functionality
  - [ ] 11.9 Verify OpenAPI spec quality for all admin endpoints

### Phase 9: Final Verification and Documentation

- [ ] 12. Comprehensive Testing and Type Verification
  - [ ] 12.1 Run full test suite across all plugins (auth, user, bible, admin, healthcheck)
  - [ ] 12.2 Verify TypeScript compilation with no type errors
  - [ ] 12.3 Test Eden Treaty client type inference improvements
  - [ ] 12.4 Verify no breaking changes in API responses
  - [ ] 12.5 Check that all service return types match schema definitions
  - [ ] 12.6 Verify no remaining `t.Any()` usage in any schema files
  - [ ] 12.7 Run Biome linting and fix any issues

- [ ] 13. OpenAPI Specification Quality Verification
  - [ ] 13.1 Access `/openapi/json` endpoint and download spec
  - [ ] 13.2 Verify all response schemas show concrete types (no "any" types)
  - [ ] 13.3 Check nested object structures are properly represented
  - [ ] 13.4 Verify array item types are defined
  - [ ] 13.5 Confirm optional vs required field definitions are accurate
  - [ ] 13.6 Test spec with OpenAPI validator tool
  - [ ] 13.7 Document any limitations or edge cases

- [ ] 14. Documentation and Cleanup
  - [ ] 14.1 Update CLAUDE.md with notes about response schema patterns
  - [ ] 14.2 Add JSDoc comments to complex schema definitions
  - [ ] 14.3 Create migration guide for developers (if needed)
  - [ ] 14.4 Update spec recap with implementation notes
  - [ ] 14.5 Mark all tasks complete in tasks.md
