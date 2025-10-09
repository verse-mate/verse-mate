# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-10-10-replace-remaining-tany-types/spec.md

> Created: 2025-10-09
> Version: 1.0.0

## Technical Requirements

### Bible Plugin Entity Updates

**File**: `packages/backend-base/src/bible/entities.ts`

1. **Book Schema** (1 t.Any())
   - Analyze BibleService.getBooks() return type
   - Replace with schema containing: id, name, testament, chapter_count, etc.

2. **LastChapterRead Schema** (1 t.Any())
   - Analyze UserBibleService.getLastChapterRead() return type
   - Replace with schema containing: book_id, chapter, user_id, timestamps

3. **GroupedChatHistory Schema** (1 t.Any())
   - Analyze ChatService.getGroupedHistory() return type
   - Replace with schema containing: date, conversations array with nested structure

4. **MessageHistory Schema** (1 t.Any())
   - Analyze ChatService.getConversationMessages() return type
   - Replace with schema containing: id, role, content, timestamps

5. **NewConversation Schema** (1 t.Any())
   - Analyze ChatService.createConversation() return type
   - Replace with schema containing: conversation_id, created_at

6. **SaveRating Schema** (1 t.Any())
   - Analyze ExplanationService.saveRating() return type
   - Replace with schema containing: rating_id, user_id, explanation_id, rating, timestamps

7. **UpdateRating Schema** (1 t.Any())
   - Analyze ExplanationService.updateRating() return type
   - Replace with schema containing: updated count or confirmation

8. **SaveLastChapterRead Schema** (1 t.Any())
   - Analyze UserBibleService.saveLastChapterRead() return type
   - Replace with schema containing: id, book_id, chapter, timestamps

9. **MessageSave Schema** (2 t.Any())
   - Analyze ChatService.saveMessage() return types (user and assistant)
   - Replace with schema containing: message_id, conversation_id, role, content, timestamps

### Admin Plugin Entity Updates

**File**: `packages/backend-base/src/admin/entities.ts`

1. **UsersList Schema** (1 t.Any())
   - Analyze AdminService.getUsers() return type
   - Replace with schema containing: id, email, name, role, created_at, etc.

2. **BatchList Schema** (1 t.Any())
   - Analyze BatchService.getBatches() return type
   - Replace with schema containing: id, name, status, total_jobs, timestamps

3. **BatchChildren Schema** (1 t.Any())
   - Analyze BatchService.getBatchChildren() return type
   - Replace with schema containing: nested batch structure with children array

4. **BatchSummary Schema** (1 t.Any())
   - Analyze BatchService.getBatchSummary() return type
   - Replace with schema containing: total, completed, failed, pending counts

5. **MonitorBatch Schema** (1 t.Any())
   - Analyze BatchService.monitorBatch() return type
   - Replace with schema containing: real-time batch metrics and job statuses

6. **DeleteExplanation Schema** (1 t.Any())
   - Analyze ExplanationService.deleteExplanation() return type
   - Replace with schema containing: deleted count or confirmation

7. **ExplanationComparison Schema** (1 t.Any())
   - Analyze ExplanationService.compareExplanations() return type
   - Replace with schema containing: before/after explanation objects with differences

8. **BulkDelete Schema** (1 t.Any())
   - Analyze ExplanationService.bulkDelete() return type
   - Replace with schema containing: deleted_count, errors array

9. **SetActiveDefault Schema** (1 t.Any())
   - Analyze ExplanationService.setActiveDefault() return type
   - Replace with schema containing: updated explanation_id, active status

10. **ExplanationHistory Schema** (1 t.Any())
    - Analyze ExplanationService.getHistory() return type
    - Replace with schema containing: version_id, content, changed_by, timestamps

11. **SystemPrompts Schema** (1 t.Any())
    - Analyze PromptService.getSystemPrompts() return type
    - Replace with schema containing: id, name, content, version, is_active

12. **UserPrompts Schema** (1 t.Any())
    - Analyze PromptService.getUserPrompts() return type
    - Replace with schema containing: id, user_id, content, timestamps

13. **UpdatePrompt Schema** (1 t.Any())
    - Analyze PromptService.updatePrompt() return type
    - Replace with schema containing: updated prompt object

14. **DeletePrompt Schema** (1 t.Any())
    - Analyze PromptService.deletePrompt() return type
    - Replace with schema containing: deleted count or confirmation

15. **PromptStatus Schema** (1 t.Any())
    - Analyze PromptService.getPromptStatus() return type
    - Replace with schema containing: id, is_active, version, last_used

16. **RestoreDefaults Schema** (1 t.Any())
    - Analyze PromptService.restoreDefaults() return type
    - Replace with schema containing: restored_count, prompts array

17. **Playground Schema** (1 t.Any())
    - Analyze PlaygroundService.execute() return type
    - Replace with schema containing: result, execution_time, tokens_used

18. **ExistingExplanation Schema** (2 t.Any())
    - Analyze ExplanationService methods returning existing explanations
    - Replace with schema containing: id, verse_id, content, model, is_active, timestamps

19. **Stats Schema** (2 t.Any())
    - Analyze StatsService methods returning statistics
    - Replace with schema containing: metric_name, value, breakdown object, period

## Approach

### Phase 1: Analysis (Simple Types - 20 instances)
1. For each t.Any(), locate the corresponding service method
2. Trace the repository method it calls
3. Document the actual return type structure
4. Create TypeBox schema matching the structure

### Phase 2: Implementation (Medium Types - 8 instances)
1. Replace simple object returns with straightforward schemas
2. Handle optional fields with t.Optional()
3. Add proper descriptions for OpenAPI documentation
4. Test TypeScript inference with sample API calls

### Phase 3: Complex Types (2 instances)
1. Handle nested object structures (GroupedChatHistory)
2. Handle union types or conditional returns (Stats with different breakdown types)
3. Use t.Composite() or t.Union() for complex schemas
4. Add comprehensive tests for edge cases

### Phase 4: Dynamic Types Documentation (2 instances)
1. Identify types that should remain t.Any() (e.g., Playground results)
2. Document why these are intentionally dynamic
3. Add JSDoc comments explaining the decision

### Phase 5: Validation
1. Run `bun tsc` to verify TypeScript compilation
2. Run `bun test` from packages/backend-base to verify tests
3. Inspect OpenAPI output to verify schema completeness
4. Test Eden Treaty client inference with sample calls

## External Dependencies

- **TypeBox** (@sinclair/typebox) - Already in use for schema definitions
- **Elysia** - Already in use for API framework
- **Kysely** - Already in use for database types (will inform schema structures)
- **BullMQ** - May inform batch/queue related types

## Testing Strategy

1. **Type Checking**: Verify all replacements pass TypeScript compilation
2. **Unit Tests**: Existing service tests should continue passing
3. **Schema Validation**: Test that schemas accept valid data and reject invalid data
4. **OpenAPI Output**: Manually inspect generated OpenAPI schema for completeness
5. **Eden Client**: Create sample API calls to verify type inference works correctly
