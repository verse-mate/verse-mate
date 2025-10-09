# Spec Tasks

> Spec: @.agent-os/specs/2025-10-09-replace-tany-with-proper-types
> Created: 2025-10-09

## Tasks

- [ ] 1. Create reusable TypeBox schema definitions
  - [ ] 1.1 Analyze actual response structures from services/repositories
  - [ ] 1.2 Create `packages/backend-base/src/bible/schemas/response-types.ts` with Book, Language, User, Bookmark, Note, Highlight, Conversation, Message, Explanation, Rating schemas
  - [ ] 1.3 Create `packages/backend-base/src/admin/schemas/response-types.ts` with BatchJob, Prompt, Stats, Grade schemas
  - [ ] 1.4 Run TypeScript compilation to verify schema definitions
  - [ ] 1.5 Verify all tests still pass

- [ ] 2. Replace t.Any() in bible.plugin.ts response schemas (22 instances)
  - [ ] 2.1 Replace BooksResponse, LanguagesResponse, TestamentsResponse (simple arrays)
  - [ ] 2.2 Replace BookResponse, ExplanationResponse (single/nested objects)
  - [ ] 2.3 Replace UserChatHistoryResponse, MessagesHistoryResponse (chat structures)
  - [ ] 2.4 Replace SaveRatingResponse, UpdateRatingResponse, RatingsResponse (result wrappers)
  - [ ] 2.5 Replace BookmarksResponse, NotesResponse, AddNoteResponse (CRUD responses)
  - [ ] 2.6 Replace HighlightsResponse, AddHighlightResponse, UpdateHighlightResponse (highlight responses)
  - [ ] 2.7 Replace LastChapterReadSaveResponse, LastChapterReadResponse (state responses)
  - [ ] 2.8 Replace SaveUserMessageResponse, SaveAiMessageResponse, NewConversationResponse (message responses)
  - [ ] 2.9 Run TypeScript compilation after each replacement
  - [ ] 2.10 Verify all tests pass (30 pass, 13 skip expected)

- [ ] 3. Replace t.Any() in admin.plugin.ts response schemas (22 instances)
  - [ ] 3.1 Replace UsersListResponse (user arrays)
  - [ ] 3.2 Replace BatchListResponse, BatchChildrenResponse, BatchSummaryResponse, MonitorBatchResponse (batch operations)
  - [ ] 3.3 Replace SystemPromptsListResponse, UserPromptsListResponse (prompt lists)
  - [ ] 3.4 Replace CreatePromptResponse, UpdatePromptResponse, DeletePromptResponse, PromptStatusResponse, RestoreDefaultsResponse (prompt CRUD)
  - [ ] 3.5 Replace DeleteExplanationResponse, ExplanationComparisonResponse, BulkDeleteResponse, ExplanationHistoryResponse (explanation management)
  - [ ] 3.6 Replace SetActiveDefaultResponse, PlaygroundResponse, ExistingExplanationResponse (utility responses)
  - [ ] 3.7 Replace StatsResponse, ExplanationsFilterResponse (analytics)
  - [ ] 3.8 Replace CommentaryGradesResponse (grading structures)
  - [ ] 3.9 Run TypeScript compilation after each replacement
  - [ ] 3.10 Verify all tests pass

- [ ] 4. Validate OpenAPI schema generation
  - [ ] 4.1 Start development server (`bun dev`)
  - [ ] 4.2 Access OpenAPI endpoint at http://localhost:3001/openapi
  - [ ] 4.3 Verify Bible endpoints show detailed type schemas (not generic {})
  - [ ] 4.4 Verify Admin endpoints show detailed type schemas
  - [ ] 4.5 Spot-check 5-10 critical endpoints for complete type definitions
  - [ ] 4.6 Document any remaining generic types that need investigation

- [ ] 5. Verify Eden Treaty type inference and final validation
  - [ ] 5.1 Check Eden Treaty client type inference in test files (spot check)
  - [ ] 5.2 Run full TypeScript compilation (`bunx tsc --noEmit`)
  - [ ] 5.3 Run all tests (`bun test`)
  - [ ] 5.4 Run linting (`bunx biome check --write .`)
  - [ ] 5.5 Build backend (`cd apps/backend && bun build`)
  - [ ] 5.6 Build frontend (`cd apps/frontend-next && bun build`)
  - [ ] 5.7 Commit changes with descriptive message
  - [ ] 5.8 Update spec status to "Completed"
