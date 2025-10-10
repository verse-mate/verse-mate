# t.Any() Usage Audit

**Date**: 2025-10-10
**Status**: Complete
**Total Instances Found**: 53

## Summary

Found 53 instances of `t.Any()` across 2 response schema files:
- **Bible Plugin**: 22 instances across 19 schemas
- **Admin Plugin**: 31 instances across 26 schemas

## Bible Plugin Response Schemas

**File**: `packages/backend-base/src/bible/schemas/bible-response.schema.ts`

### Books and Core Data (5 instances)
1. **BookSchema.books** (line 7)
   - `books: t.Array(t.Any())`
   - Comment: "Books structure is complex, using Any for now"

2. **LanguagesSchema** (line 10)
   - `t.Array(t.Any())`
   - Comment: "Language structure"

3. **ChapterSchema** (line 12)
   - `t.Any()`
   - Comment: "Chapter structure is complex"

4. **ExplanationSchema.explanation** (line 15)
   - `explanation: t.Any()`
   - Comment: "Explanation structure"

5. **TestamentsSchema.testaments** (line 19)
   - `testaments: t.Any()`
   - Comment: "Testaments structure"

### Chat and Conversations (4 instances)
6. **UserChatHistorySchema.userChatHistory** (line 30)
   - `userChatHistory: t.Any()`
   - Comment: "Grouped chat history object with periods (today, yesterday, etc.)"

7. **MessagesHistorySchema.messagesHistory** (line 34)
   - `messagesHistory: t.Array(t.Any())`

8. **NewConversationSchema.newConversation** (line 42)
   - `newConversation: t.Any()`

9. **SavedMessageSchema.result** (line 47)
   - `result: t.Any()`

### Ratings (4 instances)
10. **RatingSaveSchema.result** (line 58)
    - `result: t.Any()`

11. **RatingsSchema.userRating** (line 62)
    - `userRating: t.Any()`

12. **RatingsSchema.totalUsersWhoRated** (line 63)
    - `totalUsersWhoRated: t.Any()`

13. **RatingsSchema.averageRating** (line 64)
    - `averageRating: t.Any()`

### Last Chapter Read (2 instances)
14. **LastChapterReadSaveSchema.result** (line 71)
    - `result: t.Any()`

15. **LastChapterReadSchema.result** (line 75)
    - `result: t.Any()`

### Bookmarks (1 instance)
16. **BookmarksSchema.favorites** (line 82)
    - `favorites: t.Array(t.Any())`

### Notes (2 instances)
17. **NotesSchema.notes** (line 93)
    - `notes: t.Array(t.Any())`

18. **NoteAddSchema.note** (line 98)
    - `note: t.Any()`

### Highlights (3 instances)
19. **HighlightsSchema.highlights** (line 113)
    - `highlights: t.Array(t.Any())`

20. **HighlightAddSchema** (line 116)
    - `t.Any()`
    - Comment: "Returns highlight object directly"

21. **HighlightUpdateSchema.highlight** (line 119)
    - `highlight: t.Any()`

---

## Admin Plugin Response Schemas

**File**: `packages/backend-base/src/admin/schemas/admin-response.schema.ts`

### Languages and Stats (2 instances)
22. **LanguagesArraySchema** (line 15)
    - `t.Array(t.Any())`

23. **StatsSchema** (line 16)
    - `t.Any()`

### Users (1 instance)
24. **UsersArraySchema** (line 19)
    - `t.Array(t.Any())`

### Batch Operations (4 instances)
25. **BatchOperationSchema** (line 26)
    - `t.Any()`

26. **BatchHistorySchema** (line 39)
    - `t.Any()`

27. **BatchChildrenSchema** (line 40)
    - `t.Any()`

28. **BatchSummarySchema** (line 41)
    - `t.Any()`

### Explanations (9 instances)
29. **ExplanationDeleteSchema** (line 44)
    - `t.Any()`

30. **ExplanationRegenerateSchema** (line 45)
    - `t.Any()`

31. **ExplanationGenerateSchema** (line 46)
    - `t.Any()`

32. **ExplanationComparisonSchema** (line 47)
    - `t.Any()`

33. **ExplanationChooseSchema** (line 48)
    - `t.Any()`

34. **ExplanationsBulkDeleteSchema** (line 49)
    - `t.Any()`

35. **ExplanationsSetActiveSchema** (line 50)
    - `t.Any()`

36. **ExplanationHistorySchema** (line 51)
    - `t.Any()`

37. **ExplanationsFilterSchema** (line 52)
    - `t.Any()`

### Prompts (10 instances)
38. **SystemPromptsSchema** (line 55)
    - `t.Any()`

39. **UserPromptsSchema** (line 56)
    - `t.Any()`

40. **ExplanationTypesSchema** (line 57)
    - `t.Any()`

41. **PromptCreateSchema** (line 58)
    - `t.Any()`

42. **PromptUpdateSchema** (line 59)
    - `t.Any()`

43. **PromptDeleteSchema** (line 60)
    - `t.Any()`

44. **PromptStatusUpdateSchema** (line 61)
    - `t.Any()`

45. **RestoreDefaultsSchema** (line 62)
    - `t.Any()`

46. **PlaygroundSchema** (line 63)
    - `t.Any()`

47. **ExistingExplanationSchema** (line 64)
    - `t.Any()`

### Commentary Grading (2 instances)
48. **CommentaryGradesSchema.grades** (line 69)
    - `grades: t.Array(t.Any())`

49. **CommentaryGradesSchema.stats.gradingCriteria** (line 73)
    - `gradingCriteria: t.Array(t.Any())`

---

## Analysis Insights

### Complexity Categories

**Simple Type Replacements** (straightforward primitives or small objects):
- RatingsSchema fields (userRating, totalUsersWhoRated, averageRating)
- ChatExistsSchema, DisabledChatSchema (already properly typed)

**Array Replacements** (need item type definition):
- Languages arrays (Bible & Admin)
- Books array
- Messages history array
- Notes, Bookmarks, Highlights arrays
- Users array
- Batch arrays
- Grades and criteria arrays

**Complex Nested Objects** (require detailed structure):
- ChapterSchema (contains verses and metadata)
- ExplanationSchema
- UserChatHistorySchema (grouped by time periods)
- Conversation objects
- Batch operation responses
- Prompt schemas
- Playground and stats schemas

### Priority for Implementation

**Phase 1 - Foundation** (Task 1):
- Create reusable base types (Book, User, Message, Conversation, etc.)
- Define enum types
- Document type mapping strategy

**Phase 2 - Simple Types** (Tasks 2-3):
- Books, Chapters, Languages, Testaments
- Explanations and Ratings

**Phase 3 - Complex Structures** (Tasks 4-6):
- Chat and conversations
- User content (notes, bookmarks, highlights)

**Phase 4-8 - Admin Types** (Tasks 7-11):
- Users and languages
- Batch operations
- Explanation and prompt management
- Stats and playground

**Phase 9 - Verification** (Tasks 12-14):
- Testing and validation
- OpenAPI spec verification
- Documentation

---

## Next Steps

1. ✅ Audit complete - all t.Any() instances documented
2. ⏭️ Analyze service return types to understand actual data structures
3. ⏭️ Review database models for entity definitions
4. ⏭️ Create reusable base type definitions
5. ⏭️ Begin systematic replacement following task order
