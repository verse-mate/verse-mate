# t.Any() Instance Tracking Document

> Created: 2025-10-10
> Status: Analysis Complete

## Overview

This document tracks all 32 t.Any() instances found in the entity files, documenting their location, usage, and replacement status.

## Bible Plugin Entities (11 instances)

**File**: `packages/backend-base/src/bible/entities/bible-entities.ts`

| # | Line | Schema Name | Current JSDoc | Complexity | Status |
|---|------|-------------|---------------|------------|--------|
| 1 | 75 | BookSchema | Book structure from Bible JSON - complex nested structure with chapters/verses | COMPLEX | ⏳ Pending |
| 2 | 81 | LastChapterReadSchema | Last chapter read structure with explanation array | MEDIUM | ⏳ Pending |
| 3 | 87 | GroupedChatHistorySchema | Grouped chat history - dynamic Record<string, ChatDto[]> | COMPLEX | ⏳ Pending |
| 4 | 93 | MessageHistorySchema | Message history - complex array with book/chapter/conversation metadata | MEDIUM | ⏳ Pending |
| 5 | 99 | NewConversationSchema | New conversation result - union of { message: string } \| { chat_id: number, message: string } | SIMPLE | ⏳ Pending |
| 6 | 104 | SaveRatingResultSchema | Save rating result - { message: string } | SIMPLE | ⏳ Pending |
| 7 | 109 | UpdateRatingResultSchema | Update rating result - { success: string } \| { error: string } | SIMPLE | ⏳ Pending |
| 8 | 114 | SaveLastChapterReadResultSchema | Save last chapter read result - { message: string } | SIMPLE | ⏳ Pending |
| 9 | 120 | MessageSaveResultSchema | Message save result - partial message with just message_id, or undefined | SIMPLE | ⏳ Pending |

## Admin Plugin Entities (23 instances including nested t.Any())

**File**: `packages/backend-base/src/admin/entities/admin-entities.ts`

| # | Line | Schema Name | Current JSDoc | Complexity | Status |
|---|------|-------------|---------------|------------|--------|
| 10 | 82 | UsersListSchema | Users list - complex array with user fields | MEDIUM | ⏳ Pending |
| 11 | 88 | BatchListSchema | Batch list - complex array with batch job metadata | MEDIUM | ⏳ Pending |
| 12 | 94 | BatchChildrenSchema | Batch children - complex array with child batch information | MEDIUM | ⏳ Pending |
| 13 | 100 | BatchSummarySchema | Batch summary - complex object with batch statistics | MEDIUM | ⏳ Pending |
| 14 | 106 | MonitorBatchSchema | Monitor batch result - complex object with monitoring status | MEDIUM | ⏳ Pending |
| 15 | 111 | DeleteExplanationSchema | Delete explanation result - { success: boolean, message: string } | SIMPLE | ⏳ Pending |
| 16 | 117 | ExplanationComparisonSchema | Explanation comparison - complex object with old/new explanation comparison | MEDIUM | ⏳ Pending |
| 17 | 122 | BulkDeleteSchema | Bulk delete result - { success: boolean, deletedCount: number, message: string } | SIMPLE | ⏳ Pending |
| 18 | 127 | SetActiveDefaultSchema | Set active default result - { success: boolean, affectedCount: number, message: string } | SIMPLE | ⏳ Pending |
| 19 | 133 | ExplanationHistorySchema | Explanation history - complex array with explanation version history | MEDIUM | ⏳ Pending |
| 20 | 139 | SystemPromptsListSchema | System prompts list - complex array with system prompt details | MEDIUM | ⏳ Pending |
| 21 | 145 | UserPromptsListSchema | User prompts list - complex array with user prompt templates | MEDIUM | ⏳ Pending |
| 22 | 150 | UpdatePromptSchema | Update prompt result - { success: boolean, message: string } | SIMPLE | ⏳ Pending |
| 23 | 155 | DeletePromptSchema | Delete prompt result - { success: boolean, message: string } | SIMPLE | ⏳ Pending |
| 24 | 160 | PromptStatusSchema | Prompt status result - { success: boolean, message: string } | SIMPLE | ⏳ Pending |
| 25 | 165 | RestoreDefaultsSchema | Restore defaults result - { success: boolean, message: string, restored: number } | SIMPLE | ⏳ Pending |
| 26 | 171 | PlaygroundSchema | Playground result - complex object with AI response | DYNAMIC | ⏳ Keep as t.Any() |
| 27 | 177 | ExistingExplanationSchema | Existing explanation - complex object with explanation details | MEDIUM | ⏳ Pending |
| 28 | 183 | StatsSchema | Stats response - complex object with explanation statistics | MEDIUM | ⏳ Pending |
| 29 | 191 | CommentaryGradesSchema.grades | Commentary grades array (nested) | MEDIUM | ⏳ Pending |
| 30 | 195 | CommentaryGradesSchema.gradingCriteria | Grading criteria array (nested) | SIMPLE | ⏳ Pending |
| 31 | 204 | ExplanationsFilterSchema.explanations | Explanations array (nested) | MEDIUM | ⏳ Pending |

## Summary Statistics

- **Total t.Any() instances**: 32
- **Bible Plugin**: 9 instances
- **Admin Plugin**: 23 instances (including 3 nested)

### By Complexity:
- **SIMPLE**: 13 instances (40.6%) - Trivial objects like `{ message: string }`
- **MEDIUM**: 16 instances (50.0%) - Database queries, service structures
- **COMPLEX**: 2 instances (6.3%) - BookSchema, GroupedChatHistory
- **DYNAMIC**: 1 instance (3.1%) - Playground (intentionally keep as t.Any())

### Priority Phases:
1. **Phase 2 (Simple)**: 13 instances - ~3-4 hours
2. **Phase 3 (Medium)**: 16 instances - ~6-8 hours
3. **Phase 4 (Complex)**: 2 instances - ~2-3 hours
4. **Document Dynamic**: 1 instance - ~30 minutes

## Endpoint Usage Map

### Bible Plugin Endpoints Using t.Any()

1. `GET /bible/books` → BookSchema
2. `GET /bible/last-chapter-read` → LastChapterReadSchema
3. `GET /bible/chat-history/:userId` → GroupedChatHistorySchema
4. `GET /bible/chat/:chatId/messages` → MessageHistorySchema
5. `POST /bible/chat` → NewConversationSchema
6. `POST /bible/rating` → SaveRatingResultSchema
7. `PUT /bible/rating/:id` → UpdateRatingResultSchema
8. `POST /bible/last-chapter-read` → SaveLastChapterReadResultSchema
9. `POST /bible/chat/:chatId/message` → MessageSaveResultSchema (2 uses)

### Admin Plugin Endpoints Using t.Any()

10. `GET /admin/users` → UsersListSchema
11. `GET /admin/batches` → BatchListSchema
12. `GET /admin/batch/:id/children` → BatchChildrenSchema
13. `GET /admin/batch/:id/summary` → BatchSummarySchema
14. `POST /admin/batch/:id/monitor` → MonitorBatchSchema
15. `DELETE /admin/explanation/:id` → DeleteExplanationSchema
16. `GET /admin/explanation/:id/comparison` → ExplanationComparisonSchema
17. `DELETE /admin/explanations/bulk` → BulkDeleteSchema
18. `POST /admin/explanations/set-active` → SetActiveDefaultSchema
19. `GET /admin/explanation/:id/history` → ExplanationHistorySchema
20. `GET /admin/prompts/system` → SystemPromptsListSchema
21. `GET /admin/prompts/user` → UserPromptsListSchema
22. `PUT /admin/prompt/:id` → UpdatePromptSchema
23. `DELETE /admin/prompt/:id` → DeletePromptSchema
24. `PUT /admin/prompt/:id/status` → PromptStatusSchema
25. `POST /admin/prompts/restore-defaults` → RestoreDefaultsSchema
26. `POST /admin/playground` → PlaygroundSchema (KEEP)
27. `GET /admin/explanation/existing` → ExistingExplanationSchema
28. `GET /admin/stats` → StatsSchema
29. `GET /admin/commentary/grades` → CommentaryGradesSchema
30. `GET /admin/explanations` → ExplanationsFilterSchema

## Next Steps

1. ✅ TASK-001: Complete - Analysis document created
2. ⏳ TASK-002: Set up test environment
3. ⏳ Start with simple schemas (Phase 2)
4. ⏳ Progress to medium complexity (Phase 3)
5. ⏳ Tackle complex schemas (Phase 4)
6. ⏳ Document intentional t.Any() (PlaygroundSchema)

## Notes

- All schemas are currently documented with JSDoc comments
- Need to trace each schema back to its service method to determine actual structure
- Some schemas appear to be simple based on comments but need verification
- PlaygroundSchema should remain t.Any() as it contains arbitrary OpenAI responses
