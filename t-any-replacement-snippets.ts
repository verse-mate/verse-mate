/**
 * Ready-to-use TypeBox Schema Replacements for t.Any() instances
 *
 * This file contains properly typed schemas to replace t.Any() in:
 * - packages/backend-base/src/bible/entities/bible-entities.ts
 * - packages/backend-base/src/admin/entities/admin-entities.ts
 *
 * Copy these definitions to the appropriate files and replace the corresponding t.Any() instances.
 */

import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";
import TestamentEnum from "database/src/models/public/TestamentEnum";
import { t } from "elysia";

// ============================================================================
// PHASE 1: TRIVIAL & SIMPLE TYPES (Quick Wins)
// ============================================================================

// ---------- Bible Entities ----------

/**
 * Save rating result - { message: string }
 * Replaces: SaveRatingResultSchema (line 104)
 * Endpoint: POST /bible/book/explanation/save-rating
 */
export const SaveRatingResultSchema = t.Object({
  message: t.String(),
});

/**
 * Update rating result - { success: string } | { error: string }
 * Replaces: UpdateRatingResultSchema (line 109)
 * Endpoint: PUT /bible/book/explanation/update-rating
 */
export const UpdateRatingResultSchema = t.Union([
  t.Object({ success: t.String() }),
  t.Object({ error: t.String() }),
]);

/**
 * Save last chapter read result - { message: string }
 * Replaces: SaveLastChapterReadResultSchema (line 114)
 * Endpoint: POST /bible/book/chapter/save-last-read
 */
export const SaveLastChapterReadResultSchema = t.Object({
  message: t.String(),
});

/**
 * Message save result - { message_id?: number } | undefined
 * Replaces: MessageSaveResultSchema (line 121)
 * Endpoints: POST /bible/book/ask-verse-mate/save-user-message, save-ai-message
 */
export const MessageSaveResultSchema = t.Union([
  t.Object({
    message_id: t.Number(),
  }),
  t.Undefined(),
]);

/**
 * New conversation result - varies based on success
 * Replaces: NewConversationSchema (line 99)
 * Endpoint: POST /bible/book/new-conversation
 */
export const NewConversationSchema = t.Union([
  t.Object({
    chat_id: t.Number(),
    message: t.String(),
  }),
  t.Object({
    message: t.String(),
  }),
]);

/**
 * Grouped chat history - Record<string, ChatDto[]>
 * Replaces: GroupedChatHistorySchema (line 87)
 * Endpoint: POST /bible/book/conversations-history
 * NOTE: Already typed as GroupedChatHistoryDto! Just import it.
 */
// import { GroupedChatHistoryDto } from "../dto/chat/grouped-chat-history.dto";
// export const GroupedChatHistorySchema = GroupedChatHistoryDto;

/**
 * Message history - Array of ChatDto
 * Replaces: MessageHistorySchema (line 93)
 * Endpoint: POST /bible/book/messages-history
 * NOTE: Can reuse ChatDto array
 */
// import { ChatDto } from "../dto/chat/chat.dto";
// export const MessageHistorySchema = t.Array(ChatDto);

// ---------- Admin Entities ----------

/**
 * Delete explanation result
 * Replaces: DeleteExplanationSchema (line 111)
 * Endpoint: DELETE /admin/explanation/:id
 */
export const DeleteExplanationSchema = t.Object({
  success: t.Boolean(),
  deletedId: t.String(),
  deletedAt: t.String({ format: "date-time" }),
});

/**
 * Bulk delete result
 * Replaces: BulkDeleteSchema (line 122)
 * Endpoint: DELETE /admin/explanations/bulk
 */
export const BulkDeleteSchema = t.Object({
  success: t.Boolean(),
  deletedCount: t.Number(),
  criteria: t.Object({
    bookId: t.Optional(t.Number()),
    explanationType: t.Optional(t.String()),
    bibleVersion: t.Optional(t.String()),
    dateRange: t.Optional(
      t.Object({
        from: t.String(),
        to: t.String(),
      }),
    ),
  }),
  deletedAt: t.String({ format: "date-time" }),
});

/**
 * Set active default result - used by multiple endpoints
 * Replaces: SetActiveDefaultSchema (line 127)
 * Endpoints: POST /admin/explanations/set-active-as-default, set-defaults-active, etc.
 */
export const SetActiveDefaultSchema = t.Object({
  message: t.String(),
  // Can be deletedCount, promotedCount, activatedCount, or updatedCount
  deletedCount: t.Optional(t.Number()),
  promotedCount: t.Optional(t.Number()),
  activatedCount: t.Optional(t.Number()),
  updatedCount: t.Optional(t.Number()),
});

/**
 * Update prompt result
 * Replaces: UpdatePromptSchema (line 150)
 * Endpoints: PUT /admin/prompts/system/:id, /admin/prompts/user/:id
 */
export const UpdatePromptSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

/**
 * Delete prompt result
 * Replaces: DeletePromptSchema (line 154)
 * Endpoints: DELETE /admin/prompts/system/:id, /admin/prompts/user/:id
 */
export const DeletePromptSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

/**
 * Prompt status update result
 * Replaces: PromptStatusSchema (line 160)
 * Endpoints: PUT /admin/prompts/system/:id/status, /admin/prompts/user/:id/status
 */
export const PromptStatusSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

/**
 * Restore defaults result
 * Replaces: RestoreDefaultsSchema (line 165)
 * Endpoint: POST /admin/prompts/restore-defaults
 */
export const RestoreDefaultsSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
  restored: t.Number(),
});

/**
 * Batch summary
 * Replaces: BatchSummarySchema (line 100)
 * Endpoint: GET /admin/batch-summary/:parentId
 */
export const BatchSummarySchema = t.Object({
  aggregate_status: t.String(),
  status_progress_text: t.String(),
  total_cost: t.Number(),
});

/**
 * Monitor batch result
 * Replaces: MonitorBatchSchema (line 106)
 * Endpoints: POST /admin/monitor-bible-batch/:parentId, /admin/batches/monitor-all
 */
export const MonitorBatchSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
  summary: t.Optional(BatchSummarySchema),
});

/**
 * Users list - array of user objects
 * Replaces: UsersListSchema (lines 82, 138, 170)
 * Endpoint: GET /admin/users
 */
export const UserItemSchema = t.Object({
  id: t.String({ format: "uuid" }),
  email: t.Union([t.String({ format: "email" }), t.Null()]),
  firstName: t.Union([t.String(), t.Null()]),
  lastName: t.Union([t.String(), t.Null()]),
  is_admin: t.Boolean(),
  createdAt: t.Union([t.String({ format: "date-time" }), t.Date()]),
});

export const UsersListSchema = t.Array(UserItemSchema);

// ============================================================================
// PHASE 2: MEDIUM COMPLEXITY TYPES
// ============================================================================

/**
 * Last chapter read structure
 * Replaces: LastChapterReadSchema (line 81)
 * Endpoint: POST /bible/book/chapter/last-read
 */
export const LastChapterReadSchema = t.Object({
  book_id: t.Number(),
  chapterNumber: t.Number(),
  bookName: t.String(),
  testament: t.Enum(TestamentEnum),
  explanation: t.Array(
    t.Object({
      book_id: t.Number(),
      chapter_number: t.Number(),
      explanation_id: t.Union([t.Number(), t.Null()]),
      type: t.Union([t.Enum(ExplanationTypeEnum), t.Null()]),
      explanation: t.Union([t.String(), t.Null()]),
    }),
  ),
});

/**
 * Batch job item schema (shared by BatchListSchema and BatchChildrenSchema)
 */
export const BatchJobItemSchema = t.Object({
  id: t.Number(),
  batch_type: t.String(),
  openai_batch_id: t.Union([t.String(), t.Null()]),
  status: t.String(),
  book_id: t.Union([t.Number(), t.Null()]),
  bible_version: t.Union([t.String(), t.Null()]),
  model: t.String(),
  explanation_types: t.Array(t.String()),
  total_requests: t.Number(),
  completed_requests: t.Number(),
  failed_requests: t.Number(),
  created_by: t.String({ format: "uuid" }),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
  parent_batch_id: t.Union([t.Number(), t.Null()]),
  book_name: t.Union([t.String(), t.Null()]), // from left join with books
  actual_cost: t.Union([t.Number(), t.Null()]),
  explanations_processed: t.Union([t.Boolean(), t.Null()]),
  prompt_tokens: t.Union([t.Number(), t.Null()]),
  completion_tokens: t.Union([t.Number(), t.Null()]),
  total_tokens: t.Union([t.Number(), t.Null()]),
  source_language_code: t.Union([t.String(), t.Null()]),
  target_language_code: t.Union([t.String(), t.Null()]),
  error_file_content: t.Union([t.String(), t.Null()]),
});

/**
 * Batch list - array of batch jobs
 * Replaces: BatchListSchema (line 88)
 * Endpoint: GET /admin/batch-history
 */
export const BatchListSchema = t.Array(BatchJobItemSchema);

/**
 * Batch children - array of child batch jobs
 * Replaces: BatchChildrenSchema (line 94)
 * Endpoint: GET /admin/batch-children/:parentId
 */
export const BatchChildrenSchema = t.Array(BatchJobItemSchema);

/**
 * Explanation comparison
 * Replaces: ExplanationComparisonSchema (line 117)
 * Endpoint: GET /admin/explanation/regenerate/:regenerationId/comparison
 */
export const ExplanationComparisonSchema = t.Object({
  regenerationId: t.String(),
  bookId: t.Number(),
  chapterNumber: t.Number(),
  explanationType: t.String(),
  comparison: t.Object({
    current: t.Union([
      t.Object({
        id: t.Number(),
        content: t.Union([t.String(), t.Null()]),
        version: t.Number(),
        createdAt: t.Union([t.String({ format: "date-time" }), t.Date()]),
      }),
      t.Null(),
    ]),
    new: t.Object({
      id: t.Number(),
      content: t.String(),
      version: t.Number(),
      createdAt: t.Union([t.String({ format: "date-time" }), t.Date()]),
    }),
  }),
});

/**
 * Explanation version item (shared by history schemas)
 */
export const ExplanationVersionSchema = t.Object({
  explanation_id: t.Number(),
  type: t.String(),
  explanation: t.Union([t.String(), t.Null()]),
  chapter_id: t.Number(),
  language_code: t.String(),
  version: t.Number(),
  is_active: t.Boolean(),
  created_by_admin: t.Union([t.Boolean(), t.Null()]),
  parent_explanation_id: t.Union([t.Number(), t.Null()]),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
});

/**
 * Explanation history
 * Replaces: ExplanationHistorySchema (line 132)
 * Endpoint: GET /admin/explanation/:id/history
 */
export const ExplanationHistorySchema = t.Object({
  explanationId: t.String(),
  versions: t.Array(ExplanationVersionSchema),
  currentVersion: ExplanationVersionSchema,
  totalVersions: t.Number(),
});

/**
 * System prompts list
 * Replaces: SystemPromptsListSchema (line 139)
 * Endpoint: GET /admin/prompts/system
 */
export const SystemPromptItemSchema = t.Object({
  id: t.Number(),
  prompt: t.String(),
  prompt_type: t.String(),
  status: t.Enum(PromptStatusEnum),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
  updated_at: t.Union([t.String({ format: "date-time" }), t.Date(), t.Null()]),
});

export const SystemPromptsListSchema = t.Array(SystemPromptItemSchema);

/**
 * User prompts list
 * Replaces: UserPromptsListSchema (line 145)
 * Endpoint: GET /admin/prompts/user
 */
export const UserPromptItemSchema = t.Object({
  id: t.Number(),
  template_name: t.String(),
  explanation_type: t.String(),
  prompt_template: t.String(),
  status: t.String(),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
  updated_at: t.Union([t.String({ format: "date-time" }), t.Date(), t.Null()]),
});

export const UserPromptsListSchema = t.Array(UserPromptItemSchema);

/**
 * Existing explanation
 * Replaces: ExistingExplanationSchema (line 177)
 * Endpoint: GET /admin/prompts/explanation/existing
 */
export const ExistingExplanationSchema = ExplanationVersionSchema;

/**
 * Stats response
 * Replaces: StatsSchema (line 183)
 * Endpoint: GET /admin/stats
 */
export const StatsSchema = t.Object({
  totalExplanations: t.Number(),
  explanationsByType: t.Record(t.String(), t.Number()),
  explanationsByBook: t.Record(t.String(), t.Number()),
  explanationsByVersion: t.Record(t.String(), t.Number()),
  recentActivity: t.Array(t.Any()), // Empty in current implementation
  lastUpdated: t.Union([t.String({ format: "date-time" }), t.Date()]),
});

/**
 * Explanation with metadata (used in filter results)
 */
export const ExplanationWithMetadataSchema = t.Object({
  explanation_id: t.Number(),
  type: t.String(),
  explanation: t.Union([t.String(), t.Null()]),
  chapter_id: t.Number(),
  language_code: t.String(),
  version: t.Number(),
  is_active: t.Boolean(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  book_name: t.String(),
});

/**
 * Explanations filter result
 * Replaces: ExplanationsFilterSchema (line 206) - specifically the t.Any() in the explanations array
 * Endpoint: GET /admin/explanations
 */
export const ExplanationsFilterSchema = t.Object({
  explanations: t.Array(ExplanationWithMetadataSchema),
  total: t.Number(),
});

// ============================================================================
// PHASE 3: COMPLEX TYPES (Require investigation)
// ============================================================================

/**
 * Book structure from formatted book method
 * Replaces: BookSchema (line 75) for /book/:bookId/:chapterNumber
 * NOTE: Requires investigating VersesDto structure
 */
export const FormattedBookSchema = t.Object({
  bookId: t.Number(),
  name: t.String(),
  testament: t.Union([t.Enum(TestamentEnum), t.Null()]),
  genre: t.Object({
    g: t.Union([t.String(), t.Number()]),
    n: t.Union([t.String(), t.Undefined()]),
  }),
  chapters: t.Array(
    t.Object({
      chapterNumber: t.Number(),
      subtitles: t.Array(
        t.Object({
          subtitle: t.Union([t.String(), t.Null()]),
          verse_id: t.Union([t.Number(), t.Null()]),
        }),
      ),
      verses: t.Any(), // TODO: Replace with proper VersesDto type
    }),
  ),
});

/**
 * Playground result - OpenAI API response
 * Replaces: PlaygroundSchema (line 171)
 * Endpoint: POST /admin/prompts/playground
 * NOTE: Requires checking OpenAI SDK types
 */
export const PlaygroundSchema = t.Object({
  explanation: t.String(),
  usage: t.Object({
    input_tokens: t.Number(),
    output_tokens: t.Number(),
    total_tokens: t.Number(),
  }),
  model: t.String(),
  timing: t.Optional(
    t.Object({
      reasoning_time: t.Number(),
      total_time: t.Number(),
    }),
  ),
  // Add other OpenAI response fields as needed
});

// ============================================================================
// KEEP AS t.Any() (Dynamic/External data)
// ============================================================================

/**
 * Book structure from Bible JSON files
 * Used in: GET /books endpoint
 * Source: Parses external NASB1995.json and key_english.json files
 * Recommendation: Keep as t.Any() for external data OR create comprehensive Bible JSON schema
 */
// export const BookSchema = t.Any();

/**
 * Commentary grades (stub implementation)
 * Used in: GET/POST /admin/commentary/grades, /admin/commentary/grade
 * Recommendation: Keep as t.Any() until feature is fully implemented
 */
// export const CommentaryGradesSchema = t.Any();

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*

// Example 1: Replace in bible-entities.ts
// OLD:
export const SaveRatingResultSchema = t.Any();

// NEW:
export const SaveRatingResultSchema = t.Object({
  message: t.String()
});

// Example 2: Import existing type
// OLD:
export const GroupedChatHistorySchema = t.Any();

// NEW:
import { GroupedChatHistoryDto } from "../dto/chat/grouped-chat-history.dto";
export const GroupedChatHistorySchema = GroupedChatHistoryDto;

// Example 3: Reuse from this file
// In admin-entities.ts:
import {
  DeleteExplanationSchema,
  BulkDeleteSchema,
  UpdatePromptSchema
} from './replacement-schemas'; // or appropriate path

*/
