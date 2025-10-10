# VerseMate Database Models Analysis

**Generated:** 2025-10-10
**Purpose:** Reference for creating accurate Elysia/OpenAPI type definitions

---

## Table of Contents

1. [Core Entities](#core-entities)
   - [Bible Content Entities](#bible-content-entities)
   - [User Content Entities](#user-content-entities)
   - [AI & Chat Entities](#ai--chat-entities)
   - [Admin & System Entities](#admin--system-entities)
2. [Enum Types](#enum-types)
3. [Entity Relationships](#entity-relationships)
4. [Key Insights](#key-insights)

---

## Core Entities

### Bible Content Entities

#### 1. Books
**Table:** `public.books`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `book_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `name` | `string` | No | No | - | Book name |
| `testament` | `TestamentEnum` | No | No | - | "OT" or "NT" |
| `genre_id` | `number` | No | No | `Genres.genre_id` | Reference to genre |

**Relationships:**
- Belongs to: `Genres` (via `genre_id`)
- Has many: `Chapters`, `UserProgress`, `BatchJobs`

---

#### 2. Chapters
**Table:** `public.chapters`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `chapter_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `book_id` | `number` | No | No | `Books.book_id` | Parent book |
| `chapter_number` | `number` | No | No | - | Chapter number within book |

**Relationships:**
- Belongs to: `Books` (via `book_id`)
- Has many: `Verses`, `Subtitles`, `Explanations`, `Conversations`, `Favorites`, `VerseHighlights`, `UserProgress`

---

#### 3. Verses
**Table:** `public.verses`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `verse_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `chapter_id` | `number` | No | No | `Chapters.chapter_id` | Parent chapter |
| `verse_number` | `number` | No | No | - | Verse number within chapter |
| `text` | `string` | No | No | - | Verse text content |
| `version_id` | `string` | No | No | `BibleVersions.id` | Bible version reference |

**Relationships:**
- Belongs to: `Chapters` (via `chapter_id`)
- Belongs to: `BibleVersions` (via `version_id`)

---

#### 4. Subtitles
**Table:** `public.subtitles`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `subtitle_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `chapter_id` | `number` | No | No | `Chapters.chapter_id` | Parent chapter |
| `subtitle` | `string` | No | No | - | Subtitle text |
| `start_verse` | `number` | No | No | - | Starting verse number |
| `end_verse` | `number` | No | No | - | Ending verse number |

**Relationships:**
- Belongs to: `Chapters` (via `chapter_id`)

**Special Notes:**
- Represents section headings within chapters
- Covers a range of verses (`start_verse` to `end_verse`)

---

#### 5. BibleVersions
**Table:** `public.bible_versions`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `id` | `string` | No | Yes | - | Auto-generated if undefined on insert |
| `version_key` | `string` | No | No | - | Short version identifier (e.g., "KJV", "NIV") |
| `version_name` | `string` | No | No | - | Full version name |
| `language_code` | `string` | No | No | - | Language code (e.g., "en", "pt") |
| `is_active` | `boolean` | Yes | No | - | Whether version is currently active |
| `created_at` | `Date` | Yes | No | - | Auto-generated if undefined on insert |

**Relationships:**
- Has many: `Verses`

---

#### 6. Genres
**Table:** `public.genres`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `genre_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `name` | `string` | No | No | - | Genre name (e.g., "Law", "History", "Wisdom") |

**Relationships:**
- Has many: `Books`

---

### User Content Entities

#### 7. User
**Table:** `public.user`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `id` | `string` | No | Yes | - | Auto-generated if undefined on insert |
| `email` | `string` | No | No | - | User email address |
| `emailVerified` | `boolean` | No | No | - | Default: false |
| `password` | `string` | No | No | - | Hashed password |
| `firstName` | `string` | No | No | - | User's first name |
| `lastName` | `string` | No | No | - | User's last name |
| `imageSrc` | `string` | Yes | No | - | Profile image URL |
| `createdAt` | `Date` | No | No | - | Auto-generated if undefined on insert |
| `preferred_language` | `string` | Yes | No | - | Language preference for explanations |
| `preferred_bible_version` | `string` | Yes | No | - | Preferred Bible version |
| `is_admin` | `boolean` | No | No | - | Admin flag, default: false |

**Relationships:**
- Has many: `Favorites`, `VerseHighlights`, `UserProgress`, `Conversations`, `ExplanationRatings`, `BatchJobs`, `UserPromptTemplates`

---

#### 8. Favorites
**Table:** `public.favorites`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `favorite_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `type` | `FavoriteTypeEnum` | No | No | - | "chapter" or "message" |
| `user_id` | `string` | No | No | `User.id` | User who favorited |
| `chapter_id` | `number` | No | No | `Chapters.chapter_id` | Referenced chapter |

**Relationships:**
- Belongs to: `User` (via `user_id`)
- Belongs to: `Chapters` (via `chapter_id`)

**Special Notes:**
- Can favorite either chapters or messages
- Type determines what is being favorited

---

#### 9. VerseHighlights
**Table:** `public.verse_highlights`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `highlight_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `user_id` | `string` | No | No | `User.id` | User who created highlight |
| `chapter_id` | `number` | No | No | `Chapters.chapter_id` | Chapter containing highlighted verses |
| `start_verse` | `number` | No | No | - | Starting verse number |
| `end_verse` | `number` | No | No | - | Ending verse number |
| `color` | `HighlightColorEnum` | No | No | - | Highlight color, default provided |
| `start_char` | `number` | Yes | No | - | Character position within start verse |
| `end_char` | `number` | Yes | No | - | Character position within end verse |
| `selected_text` | `string` | Yes | No | - | Actual highlighted text |
| `created_at` | `Date` | Yes | No | - | Creation timestamp |
| `updated_at` | `Date` | Yes | No | - | Last update timestamp |

**Relationships:**
- Belongs to: `User` (via `user_id`)
- Belongs to: `Chapters` (via `chapter_id`)

**Special Notes:**
- Supports partial verse highlighting via `start_char` and `end_char`
- Can span multiple verses (`start_verse` to `end_verse`)
- Stores selected text for display purposes

---

#### 10. UserProgress
**Table:** `public.user_progress`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `user_progress_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `user_id` | `string` | No | No | `User.id` | User tracking progress |
| `book_id` | `number` | No | No | `Books.book_id` | Current book |
| `chapter_id` | `number` | No | No | `Chapters.chapter_id` | Current chapter |
| `last_visited_at` | `Date` | Yes | No | - | Last visit timestamp |

**Relationships:**
- Belongs to: `User` (via `user_id`)
- Belongs to: `Books` (via `book_id`)
- Belongs to: `Chapters` (via `chapter_id`)

**Special Notes:**
- Tracks reading progress per user
- Records last visited chapter for each book

---

### AI & Chat Entities

#### 11. Explanations
**Table:** `public.explanations`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `explanation_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `type` | `ExplanationTypeEnum` | No | No | - | "summary", "byline", or "detailed" |
| `explanation` | `string` | No | No | - | Explanation text content |
| `chapter_id` | `number` | No | No | `Chapters.chapter_id` | Chapter being explained |
| `version` | `number` | No | No | - | Version number, default: undefined |
| `is_active` | `boolean` | No | No | - | Active status, default: false |
| `created_by_admin` | `boolean` | No | No | - | Whether created by admin, default: false |
| `parent_explanation_id` | `number` | Yes | No | `Explanations.explanation_id` | Parent explanation for translations |
| `created_at` | `Date` | No | No | - | Auto-generated if undefined on insert |
| `language_code` | `string` | No | No | `ExplanationLanguages.language_code` | Language of explanation |

**Relationships:**
- Belongs to: `Chapters` (via `chapter_id`)
- Belongs to: `ExplanationLanguages` (via `language_code`)
- Self-referential: Can have parent explanation (for translations)
- Has many: `ExplanationRatings`

**Special Notes:**
- Supports versioning via `version` field
- Supports multiple languages with translation hierarchy via `parent_explanation_id`
- Three types of explanations: summary, byline, detailed

---

#### 12. ExplanationLanguages
**Table:** `public.explanation_languages`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `language_code` | `string` | No | Yes | - | ISO language code (e.g., "en", "pt") |
| `name` | `string` | No | No | - | English name of language |
| `native_name` | `string` | No | No | - | Native name of language |
| `explanation_count` | `number` | No | No | - | Count of explanations, default: 0 |
| `user_preference_count` | `number` | No | No | - | Count of users preferring this language, default: 0 |
| `is_enabled` | `boolean` | No | No | - | Whether language is enabled, default: true |
| `is_default` | `boolean` | No | No | - | Whether this is default language, default: false |
| `updated_at` | `Date` | No | No | - | Auto-generated if undefined on insert |

**Relationships:**
- Has many: `Explanations`

**Special Notes:**
- Tracks usage statistics via `explanation_count` and `user_preference_count`
- Supports enabling/disabling languages
- Only one language should have `is_default` = true

---

#### 13. ExplanationRatings
**Table:** `public.explanation_ratings`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `rating_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `stars` | `number` | No | No | - | Star rating value |
| `user_id` | `string` | No | No | `User.id` | User who rated |
| `explanation_id` | `number` | No | No | `Explanations.explanation_id` | Rated explanation |

**Relationships:**
- Belongs to: `User` (via `user_id`)
- Belongs to: `Explanations` (via `explanation_id`)

**Special Notes:**
- Users can rate AI-generated explanations
- Rating system for quality feedback

---

#### 14. Conversations
**Table:** `public.conversations`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `conversation_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `user_id` | `string` | No | No | `User.id` | Conversation owner |
| `title` | `string` | No | No | - | Conversation title |
| `chapter_id` | `number` | No | No | `Chapters.chapter_id` | Chapter context |
| `status` | `StatusEnum` | No | No | - | "active", "inactive", or "archived" |
| `created_at` | `Date` | Yes | No | - | Creation timestamp |
| `updated_at` | `Date` | Yes | No | - | Last update timestamp |

**Relationships:**
- Belongs to: `User` (via `user_id`)
- Belongs to: `Chapters` (via `chapter_id`)
- Has many: `Messages`

**Special Notes:**
- Conversations are scoped to specific chapters
- Status tracking for conversation lifecycle

---

#### 15. Messages
**Table:** `public.messages`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `message_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `conversation_id` | `number` | No | No | `Conversations.conversation_id` | Parent conversation |
| `content` | `string` | No | No | - | Message content |
| `role` | `RoleEnum` | No | No | - | "user" or "assistant" |
| `generated_at` | `Date` | Yes | No | - | Message generation timestamp |

**Relationships:**
- Belongs to: `Conversations` (via `conversation_id`)

**Special Notes:**
- Role distinguishes between user messages and AI responses
- Part of chat/conversation system

---

### Admin & System Entities

#### 16. BatchJobs
**Table:** `public.batch_jobs`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `batch_type` | `string` | No | No | - | Type of batch operation |
| `openai_batch_id` | `string` | Yes | No | - | OpenAI batch API ID |
| `status` | `string` | No | No | - | Job status, default: undefined |
| `book_id` | `number` | Yes | No | `Books.book_id` | Book scope (if applicable) |
| `bible_version` | `string` | No | No | - | Bible version for batch |
| `model` | `string` | No | No | - | AI model used |
| `explanation_types` | `string[]` | No | No | - | Array of explanation types |
| `total_requests` | `number` | No | No | - | Total requests count, default: 0 |
| `completed_requests` | `number` | No | No | - | Completed requests count, default: 0 |
| `failed_requests` | `number` | No | No | - | Failed requests count, default: 0 |
| `input_file_path` | `string` | Yes | No | - | Path to input file |
| `output_file_path` | `string` | Yes | No | - | Path to output file |
| `total_tokens` | `number` | Yes | No | - | Total tokens used |
| `prompt_tokens` | `number` | Yes | No | - | Prompt tokens used |
| `completion_tokens` | `number` | Yes | No | - | Completion tokens used |
| `estimated_cost` | `number` | Yes | No | - | Estimated cost in currency |
| `actual_cost` | `number` | Yes | No | - | Actual cost in currency |
| `created_by` | `string` | No | No | `User.id` | User who created batch |
| `created_at` | `Date` | No | No | - | Auto-generated if undefined on insert |
| `started_at` | `Date` | Yes | No | - | Job start timestamp |
| `completed_at` | `Date` | Yes | No | - | Job completion timestamp |
| `error_message` | `string` | Yes | No | - | Error message if failed |
| `explanations_processed` | `boolean` | No | No | - | Processing status, default: false |
| `parent_batch_id` | `number` | Yes | No | `BatchJobs.id` | Parent batch for child operations |
| `error_file_content` | `string` | Yes | No | - | Content of error file |
| `source_language_code` | `string` | Yes | No | - | Source language for translation batches |
| `target_language_code` | `string` | Yes | No | - | Target language for translation batches |

**Relationships:**
- Belongs to: `User` (via `created_by`)
- Belongs to: `Books` (via `book_id`, optional)
- Self-referential: Can have parent batch (via `parent_batch_id`)

**Special Notes:**
- Tracks AI batch processing jobs (OpenAI Batch API)
- Comprehensive cost and token tracking
- Supports nested batches via `parent_batch_id`
- Used for bulk explanation generation and translations

---

#### 17. Prompts
**Table:** `public.prompts`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `prompt_id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `prompt` | `string` | No | No | - | Prompt template text |
| `status` | `PromptStatusEnum` | No | No | - | "active" or "inactive" |
| `prompt_type` | `string` | No | No | - | Type of prompt, default: undefined |

**Relationships:**
- None

**Special Notes:**
- System-level prompts for AI operations
- Status indicates which prompts are currently in use

---

#### 18. UserPromptTemplates
**Table:** `public.user_prompt_templates`

| Field | TypeScript Type | Nullable | Primary Key | Foreign Key | Notes |
|-------|----------------|----------|-------------|-------------|-------|
| `id` | `number` | No | Yes | - | Auto-generated if undefined on insert |
| `template_name` | `string` | No | No | - | Name of the template |
| `explanation_type` | `string` | No | No | - | Type of explanation this template is for |
| `prompt_template` | `string` | No | No | - | Template text with placeholders |
| `status` | `string` | No | No | - | Template status, default: undefined |
| `created_at` | `Date` | No | No | - | Auto-generated if undefined on insert |
| `updated_at` | `Date` | No | No | - | Auto-generated if undefined on insert |

**Relationships:**
- None (though likely used by users via application logic)

**Special Notes:**
- User-defined prompt templates
- Allows customization of AI explanation prompts
- Supports different explanation types

---

## Enum Types

### TestamentEnum
**Database:** `public.testament_enum`

| Value | Description |
|-------|-------------|
| `"OT"` | Old Testament |
| `"NT"` | New Testament |

**Used in:**
- `Books.testament`

---

### ExplanationTypeEnum
**Database:** `public.explanation_type_enum`

| Value | Description |
|-------|-------------|
| `"summary"` | Brief summary of chapter |
| `"byline"` | Short byline/subtitle |
| `"detailed"` | Detailed explanation |

**Used in:**
- `Explanations.type`

---

### FavoriteTypeEnum
**Database:** `public.favorite_type_enum`

| Value | Description |
|-------|-------------|
| `"chapter"` | Favorite is a chapter |
| `"message"` | Favorite is a message/conversation |

**Used in:**
- `Favorites.type`

---

### HighlightColorEnum
**Database:** `public.highlight_color_enum`

| Value | Description |
|-------|-------------|
| `"yellow"` | Yellow highlight |
| `"green"` | Green highlight |
| `"blue"` | Blue highlight |
| `"pink"` | Pink highlight |
| `"purple"` | Purple highlight |
| `"orange"` | Orange highlight |

**Used in:**
- `VerseHighlights.color`

---

### RoleEnum
**Database:** `public.role_enum`

| Value | Description |
|-------|-------------|
| `"user"` | Message from user |
| `"assistant"` | Message from AI assistant |

**Used in:**
- `Messages.role`

---

### StatusEnum
**Database:** `public.status_enum`

| Value | Description |
|-------|-------------|
| `"active"` | Currently active |
| `"inactive"` | Temporarily inactive |
| `"archived"` | Permanently archived |

**Used in:**
- `Conversations.status`

---

### PromptStatusEnum
**Database:** `public.prompt_status_enum`

| Value | Description |
|-------|-------------|
| `"active"` | Prompt is currently active |
| `"inactive"` | Prompt is inactive |

**Used in:**
- `Prompts.status`

---

## Entity Relationships

### Visual Relationship Diagram

```
Bible Content Hierarchy:
  Genres (1) ──┬──> (N) Books
  Books (1) ───┬──> (N) Chapters
  Chapters (1) ─┬──> (N) Verses
                ├──> (N) Subtitles
                ├──> (N) Explanations
                ├──> (N) Conversations
                ├──> (N) Favorites
                ├──> (N) VerseHighlights
                └──> (N) UserProgress

  BibleVersions (1) ──> (N) Verses

AI Content Hierarchy:
  ExplanationLanguages (1) ──> (N) Explanations
  Explanations (1) ──┬──> (N) ExplanationRatings
                     └──> (N) Explanations (self-reference for translations)

Chat/Conversation Hierarchy:
  Conversations (1) ──> (N) Messages

User Relationships:
  User (1) ──┬──> (N) Favorites
             ├──> (N) VerseHighlights
             ├──> (N) UserProgress
             ├──> (N) Conversations
             ├──> (N) ExplanationRatings
             └──> (N) BatchJobs

Batch Processing:
  BatchJobs (1) ──> (N) BatchJobs (self-reference for child batches)
  Books (1) ──> (N) BatchJobs (optional)
  User (1) ──> (N) BatchJobs (created_by)
```

### Relationship Details

#### One-to-Many Relationships

1. **Genres → Books**
   - Each genre can have multiple books
   - Each book belongs to exactly one genre

2. **Books → Chapters**
   - Each book contains multiple chapters
   - Each chapter belongs to exactly one book

3. **Chapters → Verses**
   - Each chapter contains multiple verses
   - Each verse belongs to exactly one chapter

4. **BibleVersions → Verses**
   - Each Bible version has multiple verses
   - Each verse belongs to exactly one version

5. **Chapters → Subtitles**
   - Each chapter can have multiple section subtitles
   - Each subtitle belongs to exactly one chapter

6. **Chapters → Explanations**
   - Each chapter can have multiple explanations (different types/languages)
   - Each explanation is for exactly one chapter

7. **ExplanationLanguages → Explanations**
   - Each language can have multiple explanations
   - Each explanation is in exactly one language

8. **Explanations → ExplanationRatings**
   - Each explanation can have multiple ratings
   - Each rating is for exactly one explanation

9. **User → Favorites**
   - Each user can have multiple favorites
   - Each favorite belongs to exactly one user

10. **User → VerseHighlights**
    - Each user can have multiple highlights
    - Each highlight belongs to exactly one user

11. **User → UserProgress**
    - Each user can have multiple progress records
    - Each progress record belongs to exactly one user

12. **User → Conversations**
    - Each user can have multiple conversations
    - Each conversation belongs to exactly one user

13. **Conversations → Messages**
    - Each conversation contains multiple messages
    - Each message belongs to exactly one conversation

14. **User → BatchJobs**
    - Each user can create multiple batch jobs
    - Each batch job is created by exactly one user

#### Self-Referential Relationships

1. **Explanations → Explanations (parent_explanation_id)**
   - Used for translation hierarchy
   - Original explanation is parent, translations are children
   - Enables tracking which explanations are translations of others

2. **BatchJobs → BatchJobs (parent_batch_id)**
   - Used for nested batch operations
   - Parent batch can spawn child batches
   - Enables tracking batch operation hierarchies

#### Many-to-One Relationships

All the inverse of the one-to-many relationships above.

---

## Key Insights

### Naming Conventions

1. **Primary Keys:**
   - Pattern: `{table_name}_{id_type}` (e.g., `BooksBookId`, `ChaptersChapterId`)
   - Exported as type aliases from model files
   - Most are `number`, except: `User.id` (string), `BibleVersions.id` (string), `ExplanationLanguages.language_code` (string)

2. **Table Names:**
   - Snake case in database (e.g., `user_progress`, `bible_versions`)
   - PascalCase for TypeScript interfaces (e.g., `UserProgressTable`, `BibleVersionsTable`)

3. **Field Names:**
   - Mix of camelCase and snake_case
   - User table uses camelCase: `emailVerified`, `firstName`, `lastName`, `imageSrc`, `createdAt`
   - Most other tables use snake_case: `chapter_id`, `verse_number`, `created_at`
   - **Important:** Be aware of this inconsistency when mapping to OpenAPI types

4. **Enum Values:**
   - Lowercase strings (e.g., `"active"`, `"inactive"`, `"summary"`)
   - Exceptions: `TestamentEnum` uses uppercase (`"OT"`, `"NT"`)

### Nullable Fields Patterns

1. **Timestamps:**
   - `created_at`: Often auto-generated, sometimes nullable
   - `updated_at`: Usually nullable
   - `generated_at`: Nullable (Messages)

2. **Optional User Data:**
   - `User.imageSrc`: Nullable
   - `User.preferred_language`: Nullable
   - `User.preferred_bible_version`: Nullable

3. **Optional Metadata:**
   - `BibleVersions.is_active`: Nullable
   - `BatchJobs.*`: Many fields nullable (error_message, file paths, cost data)
   - `VerseHighlights.start_char`, `end_char`, `selected_text`: Nullable (for partial highlights)

4. **Foreign Key Relationships:**
   - Most foreign keys are required (not nullable)
   - Exceptions: `BatchJobs.book_id`, `Explanations.parent_explanation_id`, `BatchJobs.parent_batch_id`

### Auto-Generated Fields

Fields with default values or auto-generation (when undefined on insert):

1. **Primary Keys:** All auto-increment when undefined
2. **Timestamps:** `created_at`, `updated_at` (when present)
3. **Boolean Flags:**
   - `User.emailVerified` (default: false)
   - `User.is_admin` (default: false)
   - `Explanations.is_active` (default: false)
   - `Explanations.created_by_admin` (default: false)
   - `BatchJobs.explanations_processed` (default: false)
   - `ExplanationLanguages.is_enabled` (default: true)
   - `ExplanationLanguages.is_default` (default: false)
4. **Counters:**
   - `ExplanationLanguages.explanation_count` (default: 0)
   - `ExplanationLanguages.user_preference_count` (default: 0)
   - `BatchJobs.total_requests`, `completed_requests`, `failed_requests` (default: 0)

### Kysely ColumnType Pattern

All fields use Kysely's `ColumnType<SelectType, InsertType, UpdateType>`:

- **SelectType:** Type when reading from database
- **InsertType:** Type when inserting (often includes `undefined` for auto-generated fields)
- **UpdateType:** Type when updating

Example:
```typescript
created_at: ColumnType<Date, Date | string | undefined, Date | string>
```
- Read as `Date`
- Insert as `Date`, `string`, or `undefined` (auto-generated)
- Update as `Date` or `string`

### Special Field Types

1. **Arrays:**
   - `BatchJobs.explanation_types`: `string[]`

2. **Date/Timestamps:**
   - Stored as `Date` type
   - Can accept `Date | string` on insert/update for flexibility

3. **Enums:**
   - Proper TypeScript enums imported from separate files
   - Strongly typed throughout

### Data Model Insights for OpenAPI Types

1. **Verse Ranges:**
   - Multiple entities use `start_verse` and `end_verse` pattern
   - Entities: `Subtitles`, `VerseHighlights`
   - Important for range-based queries

2. **Multi-Language Support:**
   - `ExplanationLanguages` provides language metadata
   - `Explanations` links to languages via `language_code`
   - `BatchJobs` supports translation via `source_language_code` and `target_language_code`

3. **Versioning:**
   - `Explanations.version`: Supports multiple versions of explanations
   - `BibleVersions`: Different Bible translations

4. **Status Tracking:**
   - Multiple entities use status enums
   - Patterns: active/inactive, active/inactive/archived
   - Important for filtering and lifecycle management

5. **Cost Tracking:**
   - `BatchJobs` has comprehensive cost/token tracking
   - Separate fields for estimated vs actual costs
   - Tracks token usage breakdown

6. **Hierarchical Data:**
   - Self-referential relationships in `Explanations` (translations)
   - Self-referential relationships in `BatchJobs` (nested batches)
   - Tree structures in Bible content: Genres → Books → Chapters → Verses

---

## Notes for OpenAPI Type Definitions

When creating Elysia/OpenAPI types:

1. **Respect Nullability:** Pay close attention to nullable vs required fields
2. **Handle Mixed Naming:** Account for camelCase vs snake_case inconsistencies
3. **Enum Validation:** Use proper enum types for validation
4. **Auto-Generated Exclusions:** Omit auto-generated fields from create/insert types
5. **Partial Updates:** Make all fields optional for update operations
6. **Response Types:** Include computed/joined fields not present in raw tables
7. **Date Serialization:** Consider how dates will be serialized (ISO strings in JSON)
8. **Array Fields:** Properly type array fields like `explanation_types`
9. **Foreign Key Constraints:** Validate foreign key references in request types
10. **Pagination:** Add pagination metadata for list endpoints

---

**Generated by:** Claude Code
**Date:** 2025-10-10
**Purpose:** Database model reference for OpenAPI type definition generation
