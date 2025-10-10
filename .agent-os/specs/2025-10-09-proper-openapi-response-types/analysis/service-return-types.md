# Service Return Types Analysis

**Generated**: 2025-10-10
**Purpose**: Document return types from four key service files to inform OpenAPI schema definitions

---

## Table of Contents
1. [BibleService](#1-bibleservice)
2. [ChatService](#2-chatservice)
3. [AdminDatabaseService](#3-admindatabaseservice)
4. [BatchOperationService](#4-batchoperationservice)

---

## 1. BibleService

**File**: `/Users/augustochaves/Work/verse-mate/verse-mate/packages/backend-base/src/bible/services/bible.service.ts`

### 1.1 `getBook()`

**Purpose**: Retrieves a specific book with chapter, verses, and subtitles

**Return Type**:
```typescript
Promise<{
  message: string
} | {
  book: {
    bookId: number;
    name: string;
    testament: TestamentEnum;
    genre: {
      g: number;
      n: string;
    };
    chapters: Array<{
      chapterNumber: number;
      subtitles: Array<{
        subtitle: string;
        start_verse: number;
        end_verse: number;
      }>;
      verses: Array<{
        verseNumber: number;
        text: string;
      }>;
    }>;
  } | null
}>
```

**Notes**:
- Can return error message `{ message: "Book not found" }` or `{ message: "Chapter not found" }`
- The `book` field may be `null` if required fields are missing
- Testament is an enum (likely "OT" | "NT")
- Genre is abbreviated with `g` (genre_id) and `n` (name)

---

### 1.2 `getTestaments()`

**Purpose**: Returns all testaments with their books

**Return Type**:
```typescript
Promise<{
  testaments: {
    keys: Array<{
      b: number;        // book_id
      c: number;        // total_chapters
      n: string;        // name
      t: TestamentEnum; // testament
      g: number;        // genre_id
    }>;
  };
}>
```

**Notes**:
- Uses abbreviated field names (b, c, n, t, g) for compact JSON
- All fields are non-nullable in the array items

---

### 1.3 `saveExplanation()`

**Purpose**: Saves a chapter explanation

**Return Type**:
```typescript
Promise<{ success: boolean }>
```

**Notes**:
- Simple success/failure response
- Returns `false` if chapter_id or version not found

---

### 1.4 `getExplanation()`

**Purpose**: Retrieves an explanation for a chapter

**Return Type**:
```typescript
Promise<null | {
  book_id: number;
  chapter_number: number;
  type: ExplanationTypeEnum;
  explanation: string | null;
  explanation_id: number;
  language_code: string;
}>
```

**Notes**:
- Can return `null` if version not found or explanation doesn't exist
- `explanation` field itself can be `null`
- ExplanationTypeEnum values not shown but likely: "summary" | "devotional" | "historical_context" | etc.
- The explanation text is processed through `parseAndInjectVerses()` before return

---

### 1.5 `saveRating()`

**Purpose**: Saves or updates a user's rating for an explanation

**Return Type**:
```typescript
Promise<{ message: string }>
```

**Possible values**:
- `{ message: "Rating saved" }`
- `{ message: "Rating updated" }`
- `{ message: "Error saving rating" }`
- `{ message: "Error updating rating" }`

---

### 1.6 `updatedUserRating()`

**Purpose**: Updates user rating (alternative method)

**Return Type**:
```typescript
Promise<{ success: string } | { error: string }>
```

**Notes**:
- Inconsistent pattern - uses both `success` and `error` fields
- Should be unified with `saveRating()`

---

### 1.7 `ratingByUser()`

**Purpose**: Gets a user's rating for an explanation

**Return Type**:
```typescript
Promise<{
  userRating: {
    stars: number;
  };
}>
```

**Notes**:
- Returns `{ stars: 0 }` if no rating found
- Stars is always a number, never null

---

### 1.8 `totalUsersWhoRated()`

**Purpose**: Counts users who rated an explanation

**Return Type**:
```typescript
Promise<{
  total_users: number;
}>
```

**Notes**:
- Returns `0` if no ratings found
- Never null

---

### 1.9 `averageRating()`

**Purpose**: Calculates average rating for an explanation

**Return Type**:
```typescript
Promise<{
  averageRating: number;
}>
```

**Notes**:
- Returns `0` if no ratings found
- Never null

---

### 1.10 `saveLastChapterRead()`

**Purpose**: Saves user's last read chapter

**Return Type**:
```typescript
Promise<{ message: string }>
```

**Possible values**:
- `{ message: "Chapter not found" }`
- `{ message: "Last chapter read saved" }`
- `{ message: "Last chapter read updated" }`
- `{ message: "Error saving last chapter read" }`
- `{ message: "Error updating last chapter read" }`

---

### 1.11 `lastChapterReadByUser()`

**Purpose**: Retrieves user's last read chapter

**Return Type**:
```typescript
Promise<null | {
  book_id: number;
  chapterNumber: number;
  bookName: string;
  testament: TestamentEnum;
  explanation: Array<{
    book_id: number;
    chapter_number: number;
    explanation_id: number | null;
    type: ExplanationTypeEnum | null;
    explanation: string | null;
  }>;
}>
```

**Notes**:
- Can return `null` if no chapter read or missing data
- `explanation` array is always empty `[]` in current implementation
- Individual explanation fields can be `null`

---

### 1.12 `getBookmarks()`

**Purpose**: Retrieves user's bookmarked chapters

**Return Type**:
```typescript
Promise<{
  favorites: Array<{
    favorite_id: number;
    chapter_number: number;
    book_id: number;
    book_name: string;
  }>;
}>
```

**Notes**:
- Returns empty array `[]` if no bookmarks
- Never null

---

### 1.13 `addBookmark()`

**Purpose**: Adds a chapter bookmark

**Return Type**:
```typescript
Promise<{ success: boolean }>
```

**Notes**:
- Returns `true` if already exists (idempotent)

---

### 1.14 `removeBookmark()`

**Purpose**: Removes a chapter bookmark

**Return Type**:
```typescript
Promise<{ success: boolean }>
```

**Notes**:
- Returns `false` if chapter_id not found

---

### 1.15 `getUserHighlights()`

**Purpose**: Retrieves user's verse highlights

**Return Type**:
```typescript
Promise<{
  highlights: Array<{
    highlight_id: number;
    user_id: string;
    chapter_id: number;
    start_verse: number;
    end_verse: number;
    color: HighlightColorEnum;
    start_char?: number;
    end_char?: number;
    selected_text?: string;
    created_at: Date;
    updated_at: Date;
  }>;
}>
```

**Notes**:
- Returns empty array `[]` on error
- `start_char`, `end_char`, `selected_text` are optional
- HighlightColorEnum likely: "yellow" | "green" | "blue" | "red" | "purple"

---

### 1.16 `createHighlight()`

**Purpose**: Creates a new verse highlight

**Return Type**:
```typescript
Promise<{
  success: boolean;
  error?: string;
  overlaps?: Array<any>;
  highlight?: {
    highlight_id: number;
    user_id: string;
    chapter_id: number;
    start_verse: number;
    end_verse: number;
    color: HighlightColorEnum;
    start_char?: number;
    end_char?: number;
    selected_text?: string;
    created_at: Date;
    updated_at: Date;
  };
}>
```

**Notes**:
- Returns `{ success: false, error: "Invalid verse range" }` for validation errors
- Returns `{ success: false, error: "Chapter not found" }` if chapter doesn't exist
- Returns `{ success: false, error: "Highlight overlaps with existing highlights", overlaps: [...] }` for overlaps
- Returns `{ highlight: {...}, success: true }` on success

---

### 1.17 `updateHighlightColor()`

**Purpose**: Updates highlight color

**Return Type**:
```typescript
Promise<{
  highlight: {
    highlight_id: number;
    user_id: string;
    chapter_id: number;
    start_verse: number;
    end_verse: number;
    color: HighlightColorEnum;
    start_char?: number;
    end_char?: number;
    selected_text?: string;
    created_at: Date;
    updated_at: Date;
  } | null;
  success: boolean;
}>
```

**Notes**:
- `highlight` is `null` if update fails or highlight not found

---

### 1.18 `deleteHighlight()`

**Purpose**: Deletes a highlight

**Return Type**:
```typescript
Promise<{ success: boolean }>
```

---

### 1.19 `getChapterHighlights()`

**Purpose**: Gets all highlights for a specific chapter

**Return Type**:
```typescript
Promise<{
  highlights: Array<{
    highlight_id: number;
    user_id: string;
    chapter_id: number;
    start_verse: number;
    end_verse: number;
    color: HighlightColorEnum;
    start_char?: number;
    end_char?: number;
    selected_text?: string;
    created_at: Date;
    updated_at: Date;
  }>;
}>
```

**Notes**:
- Returns empty array `[]` if chapter_id not found

---

### 1.20 `deleteInactiveExplanations()`

**Purpose**: Deletes inactive explanations

**Return Type**:
```typescript
Promise<{
  message: string;
  deletedCount: number;
}>
```

**Example**: `{ message: "Successfully deleted 42 inactive explanations.", deletedCount: 42 }`

---

### 1.21 `setDefaultExplanationsAsActive()`

**Purpose**: Activates default explanations

**Return Type**:
```typescript
Promise<{
  message: string;
  activatedCount: number;
}>
```

**Notes**:
- Returns `{ message: "No chapters found for the selected criteria.", activatedCount: 0 }` if no chapters match

---

### 1.22 `setActiveExplanationsAsDefault()`

**Purpose**: Promotes active explanations to default

**Return Type**:
```typescript
Promise<{
  message: string;
  promotedCount: number;
}>
```

---

### 1.23 `setSpecificExplanationVersionAsActive()`

**Purpose**: Activates a specific explanation version

**Return Type**:
```typescript
Promise<{
  message: string;
  updatedCount: number;
}>
```

---

### 1.24 `getNotes()`

**Purpose**: Retrieves user's notes

**Return Type**:
```typescript
Promise<{
  notes: Array<{
    note_id: string;
    content: string;
    created_at: Date;
    updated_at: Date;
    chapter_number: number;
    book_id: number;
    book_name: string;
    verse_number: number | null;
  }>;
}>
```

---

### 1.25 `addNote()`

**Purpose**: Adds a new note

**Return Type**:
```typescript
Promise<{
  note: {
    note_id: string;
    user_id: string;
    chapter_id: number;
    verse_id?: number;
    content: string;
    created_at: string;
    updated_at: string;
  };
}>
```

---

### 1.26 `updateNote()`

**Purpose**: Updates a note's content

**Return Type**:
```typescript
Promise<{ success: boolean }>
```

---

### 1.27 `deleteNote()`

**Purpose**: Deletes a note

**Return Type**:
```typescript
Promise<{ success: boolean }>
```

---

### 1.28 `getExplanationsByFilter()`

**Purpose**: Retrieves explanations with pagination

**Return Type**:
```typescript
Promise<{
  explanations: Array<{
    explanation_id: number;
    type: ExplanationTypeEnum;
    explanation: string;
    chapter_id: number;
    language_code: string;
    version: number;
    is_active: boolean;
    created_by_admin: boolean;
    parent_explanation_id: number | null;
    created_at: Date;
  }>;
  total: number;
}>
```

**Notes**:
- Returns `{ explanations: [], total: 0 }` if bookName not provided in non-bible batch mode

---

### 1.29 `getAvailableExplanationLanguages()`

**Purpose**: Lists available languages for explanations

**Return Type**:
```typescript
Promise<Array<{
  language_code: string;
  name: string;
  native_name: string;
  explanation_count: number;
}>>
```

---

### 1.30 `getAvailableBibleVersionLanguages()`

**Purpose**: Lists languages with Bible versions

**Return Type**:
```typescript
Promise<Array<{
  code: string;
  name: string;
  nativeName: string;
}>>
```

---

### 1.31 `refreshLanguageStats()`

**Purpose**: Refreshes language statistics

**Return Type**:
```typescript
Promise<{
  success: boolean;
  message: string;
}>
```

**Example**: `{ success: true, message: "Language stats refreshed successfully." }`

---

## 2. ChatService

**File**: `/Users/augustochaves/Work/verse-mate/verse-mate/packages/backend-base/src/bible/services/chat.service.ts`

### 2.1 `createNewChat()`

**Purpose**: Creates a new chat conversation

**Return Type**:
```typescript
Promise<{
  message: string;
  chat_id?: number;
}>
```

**Possible values**:
- `{ message: "Book not found" }`
- `{ message: "Chapter not found" }`
- `{ chat_id: 123, message: "Chat created" }`

---

### 2.2 `checkIfChatExists()`

**Purpose**: Checks if a chat exists for a user and chapter

**Return Type**:
```typescript
Promise<{
  chatExists: {
    conversation_id: number;
    user_id: string;
    chapter_id: number;
    title: string;
    status: StatusEnum;
    created_at: Date;
    updated_at: Date;
  } | null;
}>
```

**Notes**:
- StatusEnum likely: "active" | "inactive" | "archived"

---

### 2.3 `addMessageToChat()`

**Purpose**: Adds a message to a chat

**Return Type**:
```typescript
Promise<{
  newMessage: {
    message_id: number;
    conversation_id: number;
    content: string;
    role: RoleEnum;
    created_at: Date;
  };
}>
```

**Notes**:
- RoleEnum likely: "user" | "assistant" | "system"

---

### 2.4 `getUserChatHistory()`

**Purpose**: Retrieves user's chat history grouped by time periods

**Return Type**:
```typescript
Promise<GroupedChatHistoryDto>
```

**Expanded**:
```typescript
Promise<Record<string, Array<{
  conversation_id: number;
  user_id: string;
  title: string;
  status: StatusEnum;
  updated_at: Date;
  book: {
    book_id: number;
    name: string;
    testament: TestamentEnum;
    genre_id: number;
  };
  chapter_number: number | null;
  messages: Array<{
    message_id: number;
    content: string;
    role: RoleEnum;
  }>;
}>>>
```

**Notes**:
- Keys are period labels: "today", "yesterday", "lastSevenDays", "older"
- Returns grouped conversations by recency

---

### 2.5 `getUserChatMessageHistory()`

**Purpose**: Retrieves messages for a specific conversation

**Return Type**:
```typescript
Promise<Array<{
  message_id: number;
  conversation_id: number;
  content: string;
  role: RoleEnum;
  created_at: Date;
}>>
```

---

### 2.6 `disableChat()`

**Purpose**: Disables a chat conversation

**Return Type**:
```typescript
Promise<{
  chat_id: number | undefined;
}>
```

**Notes**:
- Returns `undefined` if chat not found

---

## 3. AdminDatabaseService

**File**: `/Users/augustochaves/Work/verse-mate/verse-mate/packages/backend-base/src/admin/services/admin-database.service.ts`

### 3.1 `deleteExplanation()`

**Purpose**: Deletes an explanation by ID

**Return Type**:
```typescript
Promise<{
  success: boolean;
  deletedId: string;
  deletedAt: Date;
}>
```

**Notes**:
- Throws `NotFoundError` if explanation not found

---

### 3.2 `regenerateExplanation()`

**Purpose**: Initiates explanation regeneration

**Return Type**:
```typescript
Promise<{
  success: boolean;
  regenerationId: string;
  currentExplanation: {
    id: number;
    content: string | null;
    version: number;
  };
  bookId: number;
  chapterNumber: number;
  explanationType: ExplanationTypeEnum;
  bibleVersion: string;
  adminUserId: string;
  status: string;
  createdAt: Date;
}>
```

**Notes**:
- `regenerationId` format: `regen_{bookId}_{chapterNumber}_{explanationType}_{timestamp}`
- `status` is always `"pending_generation"` on creation
- Throws `NotFoundError` if chapter, version, or explanation not found

---

### 3.3 `saveRegeneratedExplanation()`

**Purpose**: Saves regenerated explanation (placeholder implementation)

**Return Type**:
```typescript
Promise<{
  success: boolean;
  regenerationId: string;
  newExplanation: {
    id: number;
    content: string;
    version: number;
    isActive: boolean;
  };
  status: string;
}>
```

**Notes**:
- Current implementation returns mock data
- `status` is always `"awaiting_admin_choice"`

---

### 3.4 `getExplanationComparison()`

**Purpose**: Compares current and regenerated explanations

**Return Type**:
```typescript
Promise<{
  regenerationId: string;
  bookId: number;
  chapterNumber: number;
  explanationType: ExplanationTypeEnum;
  comparison: {
    current: {
      id: number;
      content: string | null;
      version: number;
      createdAt: Date;
    } | null;
    new: {
      id: number;
      content: string;
      version: number;
      createdAt: Date;
    };
  };
}>
```

**Notes**:
- `current` can be `null` if no existing explanation
- Throws `NotFoundError` if chapter or version not found

---

### 3.5 `chooseExplanationVersion()`

**Purpose**: Admin chooses which explanation version to keep

**Return Type**:
```typescript
Promise<{
  success: boolean;
  message: string;
  chosenVersion: "new" | "current";
  regenerationId: string;
  chosenExplanationId: number;
}>
```

---

### 3.6 `getExplanationStats()`

**Purpose**: Retrieves explanation statistics

**Return Type**:
```typescript
Promise<{
  totalExplanations: number;
  explanationsByType: Record<string, number>;
  explanationsByBook: Record<string, number>;
  explanationsByVersion: Record<string, number>;
  recentActivity: Array<any>;
  lastUpdated: Date;
}>
```

**Notes**:
- `explanationsByType` keys are ExplanationTypeEnum values
- `explanationsByBook` keys are book names
- `explanationsByVersion` is currently empty `{}`
- `recentActivity` is currently empty `[]`

---

### 3.7 `bulkDeleteExplanations()`

**Purpose**: Deletes explanations in bulk by criteria

**Return Type**:
```typescript
Promise<{
  success: boolean;
  deletedCount: number;
  criteria: {
    bookId?: number;
    explanationType?: string;
    bibleVersion?: string;
    dateRange?: {
      from: string;
      to: string;
    };
  };
  deletedAt: Date;
}>
```

---

### 3.8 `getExplanationHistory()`

**Purpose**: Retrieves version history for an explanation

**Return Type**:
```typescript
Promise<{
  explanationId: string;
  versions: Array<{
    explanation_id: number;
    type: ExplanationTypeEnum;
    explanation: string;
    chapter_id: number;
    language_code: string;
    version: number;
    is_active: boolean;
    created_by_admin: boolean;
    parent_explanation_id: number | null;
    created_at: Date;
  }>;
  currentVersion: {
    explanation_id: number;
    type: ExplanationTypeEnum;
    explanation: string;
    chapter_id: number;
    language_code: string;
    version: number;
    is_active: boolean;
    created_by_admin: boolean;
    parent_explanation_id: number | null;
    created_at: Date;
  };
  totalVersions: number;
}>
```

**Notes**:
- Throws `NotFoundError` if explanation not found
- Current implementation only returns single version

---

## 4. BatchOperationService

**File**: `/Users/augustochaves/Work/verse-mate/verse-mate/packages/backend-base/src/admin/services/batch-operations.service.ts`

### 4.1 `generateBookBatchByName()`

**Purpose**: Generates batch by book name

**Return Type**:
```typescript
Promise<OpenAI.Batch>
```

**OpenAI.Batch structure**:
```typescript
{
  id: string;
  object: "batch";
  endpoint: string;
  errors: {
    object: "list";
    data: Array<{
      code: string;
      message: string;
      param: string | null;
      line: number | null;
    }>;
  } | null;
  input_file_id: string;
  completion_window: string;
  status: "validating" | "failed" | "in_progress" | "finalizing" | "completed" | "expired" | "cancelling" | "cancelled";
  output_file_id: string | null;
  error_file_id: string | null;
  created_at: number;
  in_progress_at: number | null;
  expires_at: number | null;
  finalizing_at: number | null;
  completed_at: number | null;
  failed_at: number | null;
  expired_at: number | null;
  cancelling_at: number | null;
  cancelled_at: number | null;
  request_counts: {
    total: number;
    completed: number;
    failed: number;
  } | null;
  metadata: Record<string, string> | null;
}
```

**Notes**:
- Throws `NotFoundError` if book not found
- Delegates to `generateBookBatch()`

---

### 4.2 `generateBookBatch()`

**Purpose**: Generates batch for a book

**Return Type**: Same as `generateBookBatchByName()` - `Promise<OpenAI.Batch>`

---

### 4.3 `generateBibleBatch()`

**Purpose**: Generates batch for entire Bible

**Return Type**:
```typescript
Promise<{
  success: boolean;
  message: string;
  results: Array<{
    success: boolean;
    id?: string;
    object?: string;
    bookId?: number;
    bookName?: string;
    error?: string;
  }>;
  parentBatchId: number;
}>
```

**Notes**:
- Creates a parent batch and child batches for each book
- `results` array contains success/failure for each book batch

---

### 4.4 `generateRephraseBatch()`

**Purpose**: Generates rephrase batch

**Return Type**:
```typescript
Promise<{
  success: boolean;
  message: string;
  parentBatchId?: number;
} | OpenAI.Batch>
```

**Notes**:
- For type "bible", returns `{ success, message, parentBatchId }`
- For type "book", returns `OpenAI.Batch`

---

### 4.5 `generateTranslateBatch()`

**Purpose**: Generates translation batch

**Return Type**: Same as `generateRephraseBatch()`

---

### 4.6 `getBatchStatus()`

**Purpose**: Retrieves batch status from OpenAI

**Return Type**: `Promise<OpenAI.Batch>`

**Notes**:
- Updates database with current status
- Adds completed batches to processing queue

---

### 4.7 `processBatch()`

**Purpose**: Processes completed batch results

**Return Type**: `Promise<void>`

**Notes**:
- No return value
- Downloads and processes output/error files

---

### 4.8 `cancelBatch()`

**Purpose**: Cancels a batch operation

**Return Type**:
```typescript
Promise<{
  success: boolean;
  message: string;
} | OpenAI.Batch>
```

**Notes**:
- For parent batches (bible/rephrase-bible/translate-bible), returns `{ success, message }`
- For single batches, returns `OpenAI.Batch`

---

### 4.9 `getAllBatches()`

**Purpose**: Lists all batches with pagination

**Return Type**:
```typescript
Promise<Array<{
  id: number;
  batch_type: "book" | "bible" | "rephrase" | "rephrase-bible" | "translate" | "translate-bible";
  openai_batch_id: string | null;
  status: string;
  book_id: number | null;
  bible_version: string;
  model: string;
  explanation_types: Array<ExplanationTypeEnum>;
  total_requests: number;
  completed_requests: number;
  failed_requests: number;
  explanations_processed: boolean;
  actual_cost: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  created_by: string;
  created_at: Date;
  parent_batch_id: number | null;
  source_language_code: string | null;
  target_language_code: string | null;
  error_file_content: string | null;
  book_name: string | null;
}>>
```

---

### 4.10 `getBatchChildren()`

**Purpose**: Gets child batches for a parent batch

**Return Type**: Same as `getAllBatches()`

---

### 4.11 `monitorBibleBatch()`

**Purpose**: Monitors parent batch and all children

**Return Type**:
```typescript
Promise<{
  success: boolean;
  message: string;
  summary?: {
    aggregate_status: string;
    status_progress_text: string;
    total_cost: number;
  };
}>
```

---

### 4.12 `monitorAllActiveBatches()`

**Purpose**: Queues monitoring for all active batches

**Return Type**:
```typescript
Promise<{
  success: boolean;
  message: string;
}>
```

---

### 4.13 `getBatchSummary()`

**Purpose**: Summarizes batch progress

**Return Type**:
```typescript
Promise<{
  aggregate_status: string;
  status_progress_text: string;
  total_cost: number;
}>
```

**Notes**:
- `aggregate_status` values: "failed" | "pending" | "validating" | "in_progress" | "completed" | "partial_failure" | "cancelling" | "cancelled"
- `status_progress_text` provides human-readable progress

---

## Common Patterns

### 1. Success/Failure Responses

**Pattern A** (Simple boolean):
```typescript
{ success: boolean }
```
Used in: `addBookmark`, `removeBookmark`, `deleteHighlight`, `updateNote`, `deleteNote`

**Pattern B** (Message string):
```typescript
{ message: string }
```
Used in: `saveRating`, `saveLastChapterRead`

**Pattern C** (Count with message):
```typescript
{
  message: string;
  [count_field]: number;
}
```
Used in: `deleteInactiveExplanations` (deletedCount), `setDefaultExplanationsAsActive` (activatedCount), `setActiveExplanationsAsDefault` (promotedCount)

### 2. Null vs Empty Array

- **Null pattern**: Used for single objects that may not exist
  - `getExplanation()`, `lastChapterReadByUser()`, `checkIfChatExists()`

- **Empty array pattern**: Used for collections
  - `getBookmarks()`, `getUserHighlights()`, `getNotes()`

### 3. Error Responses

Most methods use one of these patterns:
1. Return null/empty array (silent failure)
2. Return `{ success: false, error?: string }`
3. Throw error (NotFoundError, ValidationError)

### 4. Date Fields

- Database dates are returned as `Date` objects
- Some fields use ISO string format (e.g., notes timestamps)

### 5. Optional Fields

Common optional fields:
- `start_char`, `end_char`, `selected_text` (highlights)
- `verse_id` (notes)
- `parent_explanation_id` (explanations)
- Various nullable foreign keys

### 6. Abbreviated Field Names

The `getTestaments()` and `getBook()` methods use abbreviated field names for compact JSON:
- `b` = book_id
- `c` = chapter count / chapter_number
- `n` = name
- `t` = testament
- `g` = genre_id

This pattern should be documented in OpenAPI as it differs from standard field names.

---

## Recommendations for OpenAPI Schemas

1. **Create union types** for methods that return different shapes (e.g., `getBook()` can return error message or book object)

2. **Define enums** for:
   - TestamentEnum
   - ExplanationTypeEnum
   - HighlightColorEnum
   - StatusEnum
   - RoleEnum
   - Batch status values

3. **Standardize error responses** - consider creating consistent error schema across all endpoints

4. **Document nullable fields** explicitly in schemas

5. **Create reusable components** for common structures:
   - Book object
   - Chapter object
   - Highlight object
   - Message object
   - Batch object
   - Explanation object

6. **Use discriminated unions** for responses that can have different shapes (e.g., success vs error)

7. **Document date formats** - specify whether ISO string or Date object in JSON

8. **Create pagination schema** for methods returning lists with total count

9. **Define validation rules** in schemas (e.g., start_verse <= end_verse, start_char <= end_char)

10. **Document the abbreviated field name pattern** as an alternative representation
