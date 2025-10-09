# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2025-10-10-replace-remaining-tany-types/spec.md

> Created: 2025-10-09
> Status: Ready for Implementation

## Tasks

### Phase 1: Analysis & Planning

- [ ] **TASK-001**: Review all 32 t.Any() instances in bible/entities.ts and admin/entities.ts
  - Read both entity files completely
  - Document current location and usage context
  - Create tracking spreadsheet

- [ ] **TASK-002**: Set up test environment for type validation
  - Ensure `packages/backend-base/.env` is configured
  - Verify tests run successfully: `cd packages/backend-base && bun test`
  - Document baseline test results

### Phase 2: Simple Schema Replacements (14 types)

#### Bible Plugin Simple Types

- [ ] **TASK-003**: Replace Book t.Any() with proper schema
  - Trace BibleService.getBooks() → BibleRepository.getBooks()
  - Check database schema for books table
  - Create TypeBox schema
  - Verify TypeScript compilation
  - Run tests to ensure no breakage

- [ ] **TASK-004**: Replace LastChapterRead t.Any() with proper schema
  - Trace UserBibleService.getLastChapterRead()
  - Document table structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-005**: Replace MessageHistory t.Any() with proper schema
  - Trace ChatService.getConversationMessages()
  - Document message structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-006**: Replace NewConversation t.Any() with proper schema
  - Trace ChatService.createConversation()
  - Document return structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-007**: Replace SaveRating t.Any() with proper schema
  - Trace ExplanationService.saveRating()
  - Document rating structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-008**: Replace UpdateRating t.Any() with proper schema
  - Trace ExplanationService.updateRating()
  - Document return structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-009**: Replace SaveLastChapterRead t.Any() with proper schema
  - Trace UserBibleService.saveLastChapterRead()
  - Document return structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-010**: Replace MessageSave t.Any() instances (2) with proper schema
  - Trace ChatService.saveMessage() for both user and assistant
  - Document message structure
  - Create TypeBox schema
  - Test compilation
  - Verify both instances use same schema

#### Admin Plugin Simple Types

- [ ] **TASK-011**: Replace DeleteExplanation t.Any() with proper schema
  - Trace ExplanationService.deleteExplanation()
  - Document return structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-012**: Replace SetActiveDefault t.Any() with proper schema
  - Trace ExplanationService.setActiveDefault()
  - Document return structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-013**: Replace BulkDelete t.Any() with proper schema
  - Trace ExplanationService.bulkDelete()
  - Document return structure with error handling
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-014**: Replace UpdatePrompt t.Any() with proper schema
  - Trace PromptService.updatePrompt()
  - Document return structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-015**: Replace DeletePrompt t.Any() with proper schema
  - Trace PromptService.deletePrompt()
  - Document return structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-016**: Replace PromptStatus t.Any() with proper schema
  - Trace PromptService.getPromptStatus()
  - Document status structure
  - Create TypeBox schema
  - Test compilation

### Phase 3: Medium Schema Replacements (8 types)

- [ ] **TASK-017**: Replace UsersList t.Any() with proper schema
  - Trace AdminService.getUsers()
  - Document user list structure with pagination
  - Create TypeBox schema with array wrapper
  - Test compilation

- [ ] **TASK-018**: Replace SystemPrompts t.Any() with proper schema
  - Trace PromptService.getSystemPrompts()
  - Document prompt list structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-019**: Replace UserPrompts t.Any() with proper schema
  - Trace PromptService.getUserPrompts()
  - Document user prompt structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-020**: Replace RestoreDefaults t.Any() with proper schema
  - Trace PromptService.restoreDefaults()
  - Document restore result structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-021**: Replace ExistingExplanation t.Any() instances (2) with proper schema
  - Trace explanation fetching methods
  - Document full explanation structure
  - Create TypeBox schema
  - Test compilation
  - Verify both instances use same schema

- [ ] **TASK-022**: Replace BatchSummary t.Any() with proper schema
  - Trace BatchService.getBatchSummary()
  - Document summary statistics structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-023**: Replace ExplanationHistory t.Any() with proper schema
  - Trace ExplanationService.getHistory()
  - Document version history structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-024**: Replace ExplanationComparison t.Any() with proper schema
  - Trace ExplanationService.compareExplanations()
  - Document comparison structure with diff
  - Create TypeBox schema
  - Test compilation

### Phase 4: Complex Schema Replacements (4 types)

- [ ] **TASK-025**: Replace GroupedChatHistory t.Any() with proper schema
  - Trace ChatService.getGroupedHistory()
  - Document nested structure (date → conversations → messages)
  - Create TypeBox schema with nested arrays
  - Use t.Array() and t.Object() composition
  - Test compilation
  - Verify Eden client type inference

- [ ] **TASK-026**: Replace Stats t.Any() instances (2) with discriminated union schema
  - Trace all statistics methods
  - Document different stat types and their structures
  - Create discriminated union with metric field
  - Use t.Union() with multiple schema variants
  - Test compilation
  - Verify type narrowing works

- [ ] **TASK-027**: Replace BatchList t.Any() with proper schema
  - Trace BatchService.getBatches()
  - Document BullMQ batch structure
  - Create TypeBox schema matching BullMQ types
  - Test compilation
  - Test with actual BullMQ data

- [ ] **TASK-028**: Replace MonitorBatch t.Any() with proper schema
  - Trace BatchService.monitorBatch()
  - Document real-time monitoring structure
  - Create TypeBox schema
  - Test compilation

- [ ] **TASK-029**: Replace BatchChildren t.Any() with recursive schema
  - Trace BatchService.getBatchChildren()
  - Document recursive structure
  - Create TypeBox schema with self-reference
  - Test compilation
  - Verify recursive type inference works

### Phase 5: Document Intentional t.Any()

- [ ] **TASK-030**: Document Playground t.Any() as intentional
  - Add JSDoc comment explaining why t.Any() is correct here
  - Document that OpenAI responses are arbitrary
  - Add to type-analysis.md as justified exception
  - No schema replacement needed

### Phase 6: Testing & Validation

- [ ] **TASK-031**: Run comprehensive TypeScript compilation check
  - Run `bun tsc` from root
  - Verify no new type errors introduced
  - Fix any compilation issues

- [ ] **TASK-032**: Run all backend tests
  - Run `cd packages/backend-base && bun test`
  - Verify all tests pass
  - Fix any test failures

- [ ] **TASK-033**: Inspect OpenAPI schema output
  - Start backend server
  - Access OpenAPI documentation
  - Verify all updated endpoints show complete schemas
  - Document before/after comparisons for sample endpoints

- [ ] **TASK-034**: Test Eden Treaty client type inference
  - Create sample API calls in test file
  - Verify autocomplete works for all response fields
  - Verify TypeScript catches invalid field access
  - Document examples of improved type safety

- [ ] **TASK-035**: Run tests with coverage
  - Run `cd packages/backend-base && bun test --coverage`
  - Verify coverage didn't decrease
  - Document coverage metrics

### Phase 7: Documentation & Cleanup

- [ ] **TASK-036**: Update type-analysis.md with actual implementations
  - Document final schema for each replaced t.Any()
  - Note any deviations from initial analysis
  - Include code snippets of complex schemas

- [ ] **TASK-037**: Create migration guide for future type additions
  - Document process for analyzing service return types
  - Document TypeBox schema patterns used
  - Create examples for common patterns (arrays, nested objects, unions)

- [ ] **TASK-038**: Update CLAUDE.md if needed
  - Add any new patterns or conventions discovered
  - Document TypeBox schema best practices
  - Note any gotchas or edge cases

- [ ] **TASK-039**: Final verification
  - Confirm all 30 planned t.Any() instances replaced
  - Confirm 2 intentional t.Any() instances documented
  - Run full test suite one final time
  - Verify OpenAPI documentation completeness

- [ ] **TASK-040**: Create pull request
  - Write comprehensive PR description
  - Include before/after type examples
  - Document benefits (type safety, OpenAPI docs, Eden client)
  - Reference this spec in PR

## Success Criteria

- All 30 targeted t.Any() instances replaced with proper TypeBox schemas
- 2 intentional t.Any() instances (Playground result) documented with justification
- TypeScript compilation succeeds with zero new errors
- All existing tests continue to pass
- OpenAPI documentation shows complete type information for all updated endpoints
- Eden Treaty client provides full autocomplete and type checking for all responses
- Type analysis document completed with actual implementation details
- Code review approved by tech lead
- PR merged to main branch

## Estimated Timeline

- Phase 1: 2 hours (Analysis & Planning)
- Phase 2: 4 hours (Simple Schemas - 14 types)
- Phase 3: 6 hours (Medium Schemas - 8 types)
- Phase 4: 8 hours (Complex Schemas - 4 types)
- Phase 5: 1 hour (Documentation)
- Phase 6: 3 hours (Testing & Validation)
- Phase 7: 2 hours (Documentation & Cleanup)

**Total: 26 hours (approximately 3-4 working days)**
