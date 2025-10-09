# t.Any() Quick Reference Table

## Bible Entities (11 total)

| # | Schema Name | File Line | Endpoint(s) | Category | Complexity | Estimated Time |
|---|------------|-----------|-------------|----------|-----------|----------------|
| 1 | SaveRatingResultSchema | 104 | POST /book/explanation/save-rating | Trivial | ⭐ | 5 min |
| 2 | UpdateRatingResultSchema | 109 | PUT /book/explanation/update-rating | Simple | ⭐⭐ | 10 min |
| 3 | SaveLastChapterReadResultSchema | 114 | POST /book/chapter/save-last-read | Trivial | ⭐ | 5 min |
| 4 | MessageSaveResultSchema | 121 | POST /book/ask-verse-mate/save-* | Simple | ⭐⭐ | 10 min |
| 5 | NewConversationSchema | 99 | POST /book/new-conversation | Simple | ⭐⭐ | 10 min |
| 6 | LastChapterReadSchema | 81 | POST /book/chapter/last-read | Medium | ⭐⭐⭐ | 20 min |
| 7 | GroupedChatHistorySchema | 87 | POST /book/conversations-history | **ALREADY TYPED** | ✅ | 2 min (import) |
| 8 | MessageHistorySchema | 93 | POST /book/messages-history | Simple | ⭐⭐ | 5 min (reuse) |
| 9 | BookSchema (formatted) | 75 | GET /book/:bookId/:chapterNumber | Complex | ⭐⭐⭐⭐ | 1 hour |
| 10 | BookSchema (JSON) | 75 | GET /books | Dynamic | 🔄 | Keep t.Any() |
| 11 | DeleteExplanationSchema | admin:111 | (referenced from admin) | Trivial | ⭐ | 5 min |

**Bible Subtotal**: 8 typeable (73%), 1 already typed (9%), 1 complex (9%), 1 dynamic (9%)

---

## Admin Entities (21 total)

| # | Schema Name | File Line | Endpoint(s) | Category | Complexity | Estimated Time |
|---|------------|-----------|-------------|----------|-----------|----------------|
| 12 | UsersListSchema (3x) | 82,138,170 | GET /admin/users | Simple | ⭐⭐ | 15 min |
| 13 | DeleteExplanationSchema | 111 | DELETE /admin/explanation/:id | Trivial | ⭐ | 5 min |
| 14 | BulkDeleteSchema | 122 | DELETE /admin/explanations/bulk | Simple | ⭐⭐ | 10 min |
| 15 | SetActiveDefaultSchema | 127 | POST /admin/explanations/set-* (4x) | Trivial | ⭐ | 10 min |
| 16 | UpdatePromptSchema | 150 | PUT /admin/prompts/*/id | Trivial | ⭐ | 5 min |
| 17 | DeletePromptSchema | 154 | DELETE /admin/prompts/*/id | Trivial | ⭐ | 5 min |
| 18 | PromptStatusSchema | 160 | PUT /admin/prompts/*/id/status | Trivial | ⭐ | 5 min |
| 19 | RestoreDefaultsSchema | 165 | POST /admin/prompts/restore-defaults | Trivial | ⭐ | 5 min |
| 20 | BatchListSchema | 88 | GET /admin/batch-history | Medium | ⭐⭐⭐ | 30 min |
| 21 | BatchChildrenSchema | 94 | GET /admin/batch-children/:parentId | Medium | ⭐⭐⭐ | 30 min |
| 22 | BatchSummarySchema | 100 | GET /admin/batch-summary/:parentId | Trivial | ⭐ | 10 min |
| 23 | MonitorBatchSchema | 106 | POST /admin/monitor-bible-batch/:parentId | Simple | ⭐⭐ | 10 min |
| 24 | ExplanationComparisonSchema | 117 | GET /admin/explanation/.../comparison | Medium | ⭐⭐⭐ | 20 min |
| 25 | ExplanationHistorySchema | 132 | GET /admin/explanation/:id/history | Medium | ⭐⭐⭐ | 20 min |
| 26 | SystemPromptsListSchema | 139 | GET /admin/prompts/system | Medium | ⭐⭐⭐ | 20 min |
| 27 | UserPromptsListSchema | 145 | GET /admin/prompts/user | Medium | ⭐⭐⭐ | 20 min |
| 28 | PlaygroundSchema | 171 | POST /admin/prompts/playground | Complex | ⭐⭐⭐⭐ | 1 hour |
| 29 | ExistingExplanationSchema | 177 | GET /admin/prompts/explanation/existing | Medium | ⭐⭐⭐ | 20 min |
| 30 | StatsSchema | 183 | GET /admin/stats | Medium | ⭐⭐⭐ | 20 min |
| 31 | CommentaryGradesSchema (2x) | 192,195 | GET/POST /admin/commentary/* | Stub | 🚧 | Wait for impl |
| 32 | ExplanationsFilterSchema | 206 | GET /admin/explanations | Medium | ⭐⭐⭐ | 20 min |

**Admin Subtotal**: 19 typeable (90%), 2 stubs (10%)

---

## Overall Statistics

| Category | Count | Percentage | Total Time Estimate |
|----------|-------|------------|-------------------|
| **Trivial** ⭐ | 13 | 40.6% | ~1.5 hours |
| **Simple** ⭐⭐ | 7 | 21.9% | ~1.5 hours |
| **Medium** ⭐⭐⭐ | 8 | 25.0% | ~4 hours |
| **Complex** ⭐⭐⭐⭐ | 2 | 6.3% | ~2 hours |
| **Already Typed** ✅ | 1 | 3.1% | ~0.1 hours |
| **Dynamic/Stub** 🔄🚧 | 2 | 6.3% | Skip |
| **TOTAL** | **32** | **100%** | **~9 hours** |

---

## Priority Recommendations

### High Priority (Quick Wins) - Phase 1
**Total: 20 instances | Time: ~3 hours**

All Trivial + Simple + Already Typed:
- SaveRatingResultSchema
- SaveLastChapterReadResultSchema
- UpdateRatingResultSchema
- MessageSaveResultSchema
- NewConversationSchema
- DeleteExplanationSchema
- BulkDeleteSchema
- SetActiveDefaultSchema
- UpdatePromptSchema
- DeletePromptSchema
- PromptStatusSchema
- RestoreDefaultsSchema
- BatchSummarySchema
- MonitorBatchSchema
- UsersListSchema
- GroupedChatHistorySchema ✅
- MessageHistorySchema

**ROI**: 62.5% of all t.Any() instances with minimal effort

---

### Medium Priority - Phase 2
**Total: 8 instances | Time: ~4 hours**

Database & Service-backed schemas:
- LastChapterReadSchema
- BatchListSchema
- BatchChildrenSchema
- ExplanationComparisonSchema
- ExplanationHistorySchema
- SystemPromptsListSchema
- UserPromptsListSchema
- ExistingExplanationSchema
- StatsSchema
- ExplanationsFilterSchema

**ROI**: Additional 25% coverage

---

### Low Priority - Phase 3
**Total: 2 instances | Time: ~2 hours**

Complex types requiring investigation:
- BookSchema (formatted)
- PlaygroundSchema

**ROI**: 6.3% coverage, but important for API clarity

---

### Skip/Defer
**Total: 2 instances**

- BookSchema (JSON parsing) - Keep as t.Any() for external data
- CommentaryGradesSchema - Wait for feature implementation

---

## Copy-Paste Type Templates

### Template 1: Simple Message Response
```typescript
export const [SchemaName] = t.Object({
  message: t.String()
});
```

### Template 2: Success + Message
```typescript
export const [SchemaName] = t.Object({
  success: t.Boolean(),
  message: t.String()
});
```

### Template 3: Database Query Array
```typescript
export const [SchemaName] = t.Array(
  t.Object({
    id: t.Number(),
    // ... other fields from database
  })
);
```

### Template 4: Union Result
```typescript
export const [SchemaName] = t.Union([
  t.Object({ success: t.String() }),
  t.Object({ error: t.String() })
]);
```

---

## Implementation Checklist

### Before Starting
- [ ] Read analysis report (`t-any-analysis-report.md`)
- [ ] Understand current usage patterns
- [ ] Set up test environment

### Phase 1: Quick Wins (~3 hours)
- [ ] SaveRatingResultSchema
- [ ] SaveLastChapterReadResultSchema
- [ ] UpdateRatingResultSchema
- [ ] MessageSaveResultSchema
- [ ] NewConversationSchema
- [ ] DeleteExplanationSchema
- [ ] BulkDeleteSchema
- [ ] SetActiveDefaultSchema
- [ ] UpdatePromptSchema
- [ ] DeletePromptSchema
- [ ] PromptStatusSchema
- [ ] RestoreDefaultsSchema
- [ ] BatchSummarySchema
- [ ] MonitorBatchSchema
- [ ] UsersListSchema (3 instances)
- [ ] GroupedChatHistorySchema (import existing)
- [ ] MessageHistorySchema
- [ ] Test all endpoints
- [ ] Run TypeScript checks

### Phase 2: Medium Complexity (~4 hours)
- [ ] LastChapterReadSchema
- [ ] BatchListSchema
- [ ] BatchChildrenSchema
- [ ] ExplanationComparisonSchema
- [ ] ExplanationHistorySchema
- [ ] SystemPromptsListSchema
- [ ] UserPromptsListSchema
- [ ] ExistingExplanationSchema
- [ ] StatsSchema
- [ ] ExplanationsFilterSchema
- [ ] Test all endpoints
- [ ] Run TypeScript checks

### Phase 3: Complex Types (~2 hours)
- [ ] BookSchema (formatted) - investigate VersesDto
- [ ] PlaygroundSchema - check OpenAI SDK types
- [ ] Test endpoints
- [ ] Run TypeScript checks

### Final Steps
- [ ] Update documentation
- [ ] Remove JSDoc comments for typed schemas
- [ ] Run full test suite
- [ ] Create PR with changes
