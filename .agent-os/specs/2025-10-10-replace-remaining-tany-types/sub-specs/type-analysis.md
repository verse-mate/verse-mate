# Type Analysis Document

This document contains detailed analysis of each t.Any() instance and the proper TypeBox schema to replace it with.

> Created: 2025-10-09
> Version: 1.0.0

## Bible Plugin Types Analysis

### 1. Book Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `BibleService.getBooks()`
**Repository Method**: `BibleRepository.getBooks()`

**Analysis Required**:
- Trace through repository to database query
- Check `books` table schema in Kysely models
- Document all returned fields

**Expected Structure**:
```typescript
{
  id: number
  name: string
  testament: 'old' | 'new'
  chapter_count: number
  order: number
  abbreviation: string
}
```

### 2. LastChapterRead Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `UserBibleService.getLastChapterRead()`
**Repository Method**: `UserBibleRepository.getLastChapterRead()`

**Analysis Required**:
- Check `user_last_chapters` or similar table
- Document timestamp fields
- Check if any fields are nullable

**Expected Structure**:
```typescript
{
  id: number
  user_id: number
  book_id: number
  chapter: number
  created_at: string
  updated_at: string
}
```

### 3. GroupedChatHistory Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ChatService.getGroupedHistory()`
**Repository Method**: `ChatRepository.getGroupedHistory()`

**Analysis Required**:
- This is likely a complex nested structure
- Groups conversations by date
- Each group contains array of conversations
- Each conversation contains messages

**Expected Structure**:
```typescript
{
  date: string
  conversations: Array<{
    id: number
    title: string
    verse_reference: string
    message_count: number
    last_message_at: string
    messages?: Array<{
      id: number
      role: 'user' | 'assistant'
      content: string
      created_at: string
    }>
  }>
}
```

### 4. MessageHistory Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ChatService.getConversationMessages()`
**Repository Method**: `ChatRepository.getMessages()`

**Analysis Required**:
- Check `chat_messages` table structure
- Document message metadata fields
- Check for optional fields like edited_at

**Expected Structure**:
```typescript
{
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
  updated_at: string
  tokens_used?: number
}
```

### 5. NewConversation Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ChatService.createConversation()`
**Repository Method**: `ChatRepository.createConversation()`

**Analysis Required**:
- Check what fields are returned on conversation creation
- May be minimal (just id and timestamps)
- Or may include full conversation object

**Expected Structure**:
```typescript
{
  id: number
  title?: string
  verse_reference: string
  user_id: number
  created_at: string
  updated_at: string
}
```

### 6. SaveRating Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ExplanationService.saveRating()`
**Repository Method**: `RatingRepository.saveRating()`

**Analysis Required**:
- Check `ratings` or `explanation_ratings` table
- Document rating scale (1-5, boolean, etc.)
- Check if feedback text is stored

**Expected Structure**:
```typescript
{
  id: number
  user_id: number
  explanation_id: number
  rating: number
  feedback?: string
  created_at: string
}
```

### 7. UpdateRating Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ExplanationService.updateRating()`
**Repository Method**: `RatingRepository.updateRating()`

**Analysis Required**:
- Check if returns updated rating object or just confirmation
- May return { updated: true } or the full rating

**Expected Structure**:
```typescript
{
  id: number
  rating: number
  feedback?: string
  updated_at: string
}
```

### 8. SaveLastChapterRead Schema
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()`
**Service Method**: `UserBibleService.saveLastChapterRead()`
**Repository Method**: `UserBibleRepository.saveLastChapterRead()`

**Analysis Required**:
- Similar to #2 but for create operation
- May use upsert logic

**Expected Structure**:
```typescript
{
  id: number
  user_id: number
  book_id: number
  chapter: number
  verse?: number
  created_at: string
  updated_at: string
}
```

### 9. MessageSave Schema (2 instances)
**Location**: `packages/backend-base/src/bible/entities.ts`
**Current**: `t.Any()` (appears twice)
**Service Method**: `ChatService.saveMessage()` (user and assistant variants)
**Repository Method**: `ChatRepository.saveMessage()`

**Analysis Required**:
- Check what fields are returned on message save
- Likely returns the created message object
- May differ slightly for user vs assistant messages (tokens_used)

**Expected Structure**:
```typescript
{
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  tokens_used?: number
  created_at: string
}
```

## Admin Plugin Types Analysis

### 10. UsersList Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `AdminService.getUsers()`
**Repository Method**: `AdminRepository.getUsers()`

**Analysis Required**:
- Check `users` table structure
- Document which fields are included for admin list
- Check for pagination metadata

**Expected Structure**:
```typescript
{
  users: Array<{
    id: number
    email: string
    name?: string
    role: string
    is_active: boolean
    created_at: string
    last_login_at?: string
  }>
  total: number
  page: number
  per_page: number
}
```

### 11. BatchList Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `BatchService.getBatches()`
**Repository Method**: BullMQ queue inspection

**Analysis Required**:
- BullMQ batch metadata structure
- Job counts and status aggregates
- Progress information

**Expected Structure**:
```typescript
{
  batches: Array<{
    id: string
    name: string
    status: 'waiting' | 'active' | 'completed' | 'failed'
    total_jobs: number
    completed_jobs: number
    failed_jobs: number
    progress: number
    created_at: number
    finished_at?: number
  }>
  total: number
}
```

### 12. BatchChildren Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `BatchService.getBatchChildren()`
**Repository Method**: BullMQ queue inspection

**Analysis Required**:
- Nested batch structure
- Parent-child relationships
- Recursive job trees

**Expected Structure**:
```typescript
{
  id: string
  name: string
  status: string
  children: Array<{
    id: string
    name: string
    status: string
    data?: any
    children?: Array<...>
  }>
}
```

### 13. BatchSummary Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `BatchService.getBatchSummary()`
**Repository Method**: Aggregate queries on BullMQ

**Analysis Required**:
- Summary statistics for batches
- Status counts
- Performance metrics

**Expected Structure**:
```typescript
{
  total_batches: number
  active_batches: number
  completed_batches: number
  failed_batches: number
  total_jobs: number
  completed_jobs: number
  failed_jobs: number
  average_duration?: number
}
```

### 14. MonitorBatch Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `BatchService.monitorBatch()`
**Repository Method**: Real-time BullMQ monitoring

**Analysis Required**:
- Real-time batch monitoring data
- Individual job statuses
- Performance metrics

**Expected Structure**:
```typescript
{
  batch_id: string
  status: string
  progress: number
  jobs: Array<{
    id: string
    name: string
    status: string
    progress?: number
    data?: any
    error?: string
    timestamp: number
  }>
  metrics: {
    duration: number
    throughput: number
    error_rate: number
  }
}
```

### 15. DeleteExplanation Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ExplanationService.deleteExplanation()`
**Repository Method**: `ExplanationRepository.deleteExplanation()`

**Analysis Required**:
- Soft delete or hard delete
- Returns deleted count or confirmation
- May include deleted object details

**Expected Structure**:
```typescript
{
  deleted: boolean
  id: number
  verse_reference?: string
}
```

### 16. ExplanationComparison Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ExplanationService.compareExplanations()`
**Repository Method**: Multiple explanation fetches + diff logic

**Analysis Required**:
- Comparison between two explanation versions
- Diff highlighting
- Metadata differences

**Expected Structure**:
```typescript
{
  explanation_id: number
  before: {
    id: number
    content: string
    model: string
    version: number
    created_at: string
  }
  after: {
    id: number
    content: string
    model: string
    version: number
    created_at: string
  }
  differences: Array<{
    type: 'addition' | 'deletion' | 'modification'
    field: string
    old_value?: string
    new_value?: string
  }>
}
```

### 17. BulkDelete Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ExplanationService.bulkDelete()`
**Repository Method**: `ExplanationRepository.bulkDelete()`

**Analysis Required**:
- Batch deletion results
- Success/failure counts
- Error details for failures

**Expected Structure**:
```typescript
{
  deleted_count: number
  failed_count: number
  errors?: Array<{
    id: number
    error: string
  }>
}
```

### 18. SetActiveDefault Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ExplanationService.setActiveDefault()`
**Repository Method**: `ExplanationRepository.setActiveDefault()`

**Analysis Required**:
- Setting default active explanation
- Returns updated status
- May affect multiple explanations

**Expected Structure**:
```typescript
{
  explanation_id: number
  is_active: boolean
  previous_default_id?: number
  updated_at: string
}
```

### 19. ExplanationHistory Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `ExplanationService.getHistory()`
**Repository Method**: `ExplanationRepository.getHistory()`

**Analysis Required**:
- Version history for explanations
- Change tracking
- User attribution

**Expected Structure**:
```typescript
{
  explanation_id: number
  versions: Array<{
    version: number
    content: string
    model: string
    changed_by?: number
    change_reason?: string
    created_at: string
  }>
  total_versions: number
}
```

### 20. SystemPrompts Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `PromptService.getSystemPrompts()`
**Repository Method**: `PromptRepository.getSystemPrompts()`

**Analysis Required**:
- System-level prompts for AI
- Active/inactive status
- Versioning

**Expected Structure**:
```typescript
{
  prompts: Array<{
    id: number
    name: string
    content: string
    type: 'system' | 'explanation' | 'chat'
    is_active: boolean
    version: number
    created_at: string
    updated_at: string
  }>
  total: number
}
```

### 21. UserPrompts Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `PromptService.getUserPrompts()`
**Repository Method**: `PromptRepository.getUserPrompts()`

**Analysis Required**:
- User-customized prompts
- May inherit from system prompts
- User-specific overrides

**Expected Structure**:
```typescript
{
  prompts: Array<{
    id: number
    user_id: number
    system_prompt_id?: number
    content: string
    is_custom: boolean
    created_at: string
    updated_at: string
  }>
  total: number
}
```

### 22. UpdatePrompt Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `PromptService.updatePrompt()`
**Repository Method**: `PromptRepository.updatePrompt()`

**Analysis Required**:
- Returns updated prompt object
- May create new version
- May affect active status

**Expected Structure**:
```typescript
{
  id: number
  content: string
  version: number
  is_active: boolean
  updated_at: string
}
```

### 23. DeletePrompt Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `PromptService.deletePrompt()`
**Repository Method**: `PromptRepository.deletePrompt()`

**Analysis Required**:
- Soft delete or hard delete
- Returns confirmation
- May prevent deletion of active prompts

**Expected Structure**:
```typescript
{
  deleted: boolean
  id: number
  name: string
}
```

### 24. PromptStatus Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `PromptService.getPromptStatus()`
**Repository Method**: `PromptRepository.getPromptStatus()`

**Analysis Required**:
- Current status of prompts
- Usage statistics
- Active/inactive tracking

**Expected Structure**:
```typescript
{
  id: number
  name: string
  is_active: boolean
  version: number
  last_used_at?: string
  usage_count: number
}
```

### 25. RestoreDefaults Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `PromptService.restoreDefaults()`
**Repository Method**: `PromptRepository.restoreDefaults()`

**Analysis Required**:
- Restores default system prompts
- Returns list of restored prompts
- May deactivate custom prompts

**Expected Structure**:
```typescript
{
  restored_count: number
  prompts: Array<{
    id: number
    name: string
    is_active: boolean
  }>
}
```

### 26. Playground Schema
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()`
**Service Method**: `PlaygroundService.execute()`
**Repository Method**: Direct OpenAI API call

**Analysis Required**:
- **KEEP AS t.Any()**: This is intentionally dynamic
- Returns arbitrary OpenAI responses
- Schema cannot be predetermined
- Should be documented as intentional

**Justification for keeping t.Any()**:
Playground endpoint executes arbitrary prompts and returns raw OpenAI responses. The structure varies based on the prompt and OpenAI model used. Attempting to type this would be restrictive and incorrect.

### 27-28. ExistingExplanation Schema (2 instances)
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()` (appears twice)
**Service Method**: Various explanation fetching methods
**Repository Method**: `ExplanationRepository.getExplanation()`

**Analysis Required**:
- Full explanation object structure
- Metadata fields
- Related data (ratings, versions)

**Expected Structure**:
```typescript
{
  id: number
  verse_id: number
  verse_reference: string
  content: string
  model: string
  version: number
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
  ratings?: {
    average: number
    count: number
  }
}
```

### 29-30. Stats Schema (2 instances)
**Location**: `packages/backend-base/src/admin/entities.ts`
**Current**: `t.Any()` (appears twice)
**Service Method**: Various statistics methods
**Repository Method**: Aggregate queries

**Analysis Required**:
- Different stat types returned by different endpoints
- May use union types or discriminated unions
- Breakdown structures vary by metric

**Expected Structure Option 1 (User Stats)**:
```typescript
{
  metric: 'users'
  total_users: number
  active_users: number
  new_users_today: number
  breakdown_by_date: Array<{
    date: string
    count: number
  }>
}
```

**Expected Structure Option 2 (Explanation Stats)**:
```typescript
{
  metric: 'explanations'
  total_explanations: number
  explanations_today: number
  average_rating: number
  breakdown_by_model: Array<{
    model: string
    count: number
    average_rating: number
  }>
}
```

**Approach**: Use discriminated union with metric field as discriminator.

## Implementation Priority

### Phase 1: Simple Schemas (Estimated: 2 hours)
- SaveRating (#6)
- UpdateRating (#7)
- DeleteExplanation (#15)
- DeletePrompt (#23)
- UpdatePrompt (#22)
- PromptStatus (#24)
- SaveLastChapterRead (#8)
- NewConversation (#5)
- MessageSave (#9 - both instances)
- Book (#1)
- LastChapterRead (#2)
- MessageHistory (#4)
- SetActiveDefault (#18)
- BulkDelete (#17)

### Phase 2: Medium Schemas (Estimated: 3 hours)
- UsersList (#10)
- SystemPrompts (#20)
- UserPrompts (#21)
- RestoreDefaults (#25)
- ExistingExplanation (#27-28 - both instances)
- BatchSummary (#13)
- ExplanationHistory (#19)
- ExplanationComparison (#16)

### Phase 3: Complex Schemas (Estimated: 3 hours)
- GroupedChatHistory (#3) - Nested structure
- Stats (#29-30 - both instances) - Discriminated unions
- BatchList (#11) - BullMQ integration
- MonitorBatch (#14) - Real-time monitoring
- BatchChildren (#12) - Recursive structure

### Phase 4: Document Intentional t.Any() (Estimated: 30 minutes)
- Playground (#26) - Intentionally dynamic, add documentation

## Total Estimated Time: 8.5 hours
