import { t } from "elysia";

/**
 * Admin Plugin Response Entities
 *
 * These TypeBox schemas define output entities for admin.plugin.ts endpoints.
 * DTOs are for input, entities are for output (response types).
 * Use t.Any() with JSDoc for complex/dynamic structures that are hard to type precisely.
 */

// ========== Simple Value Types ==========

export const SuccessMessageSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

export const LanguageSchema = t.Object({
  language_code: t.String(),
  name: t.String(),
  native_name: t.String(),
  explanation_count: t.Number(),
});

export const LanguagesListSchema = t.Array(LanguageSchema);

export const LanguageStatsSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

export const BatchOperationSchema = t.Object({
  batchJobId: t.String(),
  message: t.String(),
  totalVerses: t.Number(),
});

export const BatchStatusSchema = t.Object({
  id: t.String(),
  status: t.String(),
  progress: t.Number(),
  total: t.Number(),
  completed: t.Number(),
  failed: t.Number(),
});

export const RegenerateExplanationSchema = t.Object({
  regenerationId: t.Number(),
  message: t.String(),
});

export const GenerateExplanationSchema = t.Object({
  success: t.Boolean(),
  explanationId: t.Number(),
  regenerationId: t.Number(),
});

export const ChooseVersionSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

export const ExplanationTypesSchema = t.Array(t.String());

export const CreatePromptSchema = t.Object({
  id: t.Number(),
  message: t.String(),
});

export const CommentaryGradeSchema = t.Object({
  success: t.Boolean(),
  grade: t.Number(),
  message: t.String(),
});

// ========== Complex Types (keeping as t.Any()) ==========

/**
 * Users list - complex array with user fields
 * Fields: id, email, firstName, lastName, is_admin, createdAt
 */
export const UserSchema = t.Object({
  id: t.String({ format: "uuid" }),
  email: t.String({ format: "email" }),
  firstName: t.String(),
  lastName: t.String(),
  is_admin: t.Boolean(),
  createdAt: t.Union([t.String({ format: "date-time" }), t.Date()]),
  emailVerified: t.Optional(t.Boolean()),
  imageSrc: t.Optional(t.String()),
  preferred_language: t.Optional(t.String()),
  preferred_bible_version: t.Optional(t.String()),
});

export const UsersListSchema = t.Array(UserSchema);

/**
 * Batch list - complex array with batch job metadata
 * Fields: various batch job fields from database
 */
export const BatchJobSchema = t.Object({
  id: t.Number(),
  batch_type: t.String(),
  openai_batch_id: t.Optional(t.String()),
  status: t.String(),
  book_id: t.Optional(t.Number()),
  bible_version: t.String(),
  model: t.String(),
  explanation_types: t.Array(t.String()),
  total_requests: t.Number(),
  completed_requests: t.Number(),
  failed_requests: t.Number(),
  input_file_path: t.Optional(t.String()),
  output_file_path: t.Optional(t.String()),
  total_tokens: t.Optional(t.Number()),
  prompt_tokens: t.Optional(t.Number()),
  completion_tokens: t.Optional(t.Number()),
  estimated_cost: t.Optional(t.Number()),
  actual_cost: t.Optional(t.Number()),
  created_by: t.String({ format: "uuid" }),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
  started_at: t.Optional(
    t.Union([t.String({ format: "date-time" }), t.Date()]),
  ),
  completed_at: t.Optional(
    t.Union([t.String({ format: "date-time" }), t.Date()]),
  ),
  error_message: t.Optional(t.String()),
  explanations_processed: t.Boolean(),
  parent_batch_id: t.Optional(t.Number()),
  error_file_content: t.Optional(t.String()),
  source_language_code: t.Optional(t.String()),
  target_language_code: t.Optional(t.String()),
  book_name: t.Optional(t.String()),
});

export const BatchListSchema = t.Array(BatchJobSchema);

/**
 * Batch children - complex array with child batch information
 * Fields: child batch job details (same structure as BatchJobSchema)
 */
export const BatchChildrenSchema = t.Array(BatchJobSchema);

/**
 * Batch summary - complex object with batch statistics
 * Fields: aggregate_status, status_progress_text, total_cost
 */
export const BatchSummarySchema = t.Object({
  aggregate_status: t.String(),
  status_progress_text: t.String(),
  total_cost: t.Number(),
});

/**
 * Monitor batch result - complex object with monitoring status
 * Fields: success, message, optional summary
 */
export const MonitorBatchSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
  summary: t.Optional(BatchSummarySchema),
});

/**
 * Delete explanation result - { success: boolean, deletedId: string, deletedAt: Date }
 */
export const DeleteExplanationSchema = t.Object({
  success: t.Boolean(),
  deletedId: t.String(),
  deletedAt: t.Union([t.String({ format: "date-time" }), t.Date()]),
});

/**
 * Explanation comparison - complex object with old/new explanation comparison
 * Fields: regeneration details, original/new explanation data
 */
export const ExplanationVersionSchema = t.Object({
  id: t.Number(),
  content: t.String(),
  version: t.Number(),
  createdAt: t.Optional(t.Union([t.String({ format: "date-time" }), t.Date()])),
});

export const ExplanationComparisonSchema = t.Object({
  regenerationId: t.String(),
  bookId: t.Number(),
  chapterNumber: t.Number(),
  explanationType: t.String(),
  comparison: t.Object({
    current: t.Optional(ExplanationVersionSchema),
    new: ExplanationVersionSchema,
  }),
});

/**
 * Bulk delete result - { success: boolean, deletedCount: number, criteria: object, deletedAt: Date }
 */
export const BulkDeleteSchema = t.Object({
  success: t.Boolean(),
  deletedCount: t.Number(),
  criteria: t.Any(),
  deletedAt: t.Union([t.String({ format: "date-time" }), t.Date()]),
});

/**
 * Set active default result - { message: string, promotedCount: number } | { message: string, activatedCount: number } | { message: string, updatedCount: number }
 */
export const SetActiveDefaultSchema = t.Union([
  t.Object({ message: t.String(), promotedCount: t.Number() }),
  t.Object({ message: t.String(), activatedCount: t.Number() }),
  t.Object({ message: t.String(), updatedCount: t.Number() }),
]);

/**
 * Explanation history - complex object with explanation version history
 * Fields: explanationId, versions, currentVersion, totalVersions
 */
export const ExplanationHistoryItemSchema = t.Object({
  explanation_id: t.Number(),
  type: t.String(),
  explanation: t.String(),
  chapter_id: t.Number(),
  version: t.Number(),
  is_active: t.Boolean(),
  created_by_admin: t.Boolean(),
  parent_explanation_id: t.Optional(t.Number()),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
  language_code: t.String(),
});

export const ExplanationHistorySchema = t.Object({
  explanationId: t.String(),
  versions: t.Array(ExplanationHistoryItemSchema),
  currentVersion: ExplanationHistoryItemSchema,
  totalVersions: t.Number(),
});

/**
 * System prompts list - complex array with system prompt details
 * Fields: prompt_id, prompt, status, prompt_type
 */
export const SystemPromptSchema = t.Object({
  prompt_id: t.Number(),
  prompt: t.String(),
  status: t.String(),
  prompt_type: t.String(),
});

export const SystemPromptsListSchema = t.Array(SystemPromptSchema);

/**
 * User prompts list - complex array with user prompt templates
 * Fields: id, template_name, explanation_type, prompt_template, status, created_at, updated_at
 */
export const UserPromptSchema = t.Object({
  id: t.Number(),
  template_name: t.String(),
  explanation_type: t.String(),
  prompt_template: t.String(),
  status: t.String(),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
  updated_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
});

export const UserPromptsListSchema = t.Array(UserPromptSchema);

/**
 * Update prompt result - { success: boolean, message: string }
 */
export const UpdatePromptSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

/**
 * Delete prompt result - { success: boolean, message: string }
 */
export const DeletePromptSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

/**
 * Prompt status result - { success: boolean, message: string }
 */
export const PromptStatusSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

/**
 * Restore defaults result - { success: boolean, message: string }
 */
export const RestoreDefaultsSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

/**
 * Playground result - OpenAI API response wrapper
 *
 * This schema is intentionally kept as t.Any() because it wraps arbitrary OpenAI API responses
 * that vary significantly based on:
 * - The model used (GPT-5 Nano, GPT-4, etc.)
 * - The prompt content and structure
 * - API version and response format changes
 * - Optional features enabled (reasoning, tokens, metadata, etc.)
 *
 * The response structure from AdminPromptService.testPrompts() returns:
 * {
 *   result: string | object  // OpenAI response.output_text or full response object
 * }
 *
 * The actual OpenAI response may contain fields like:
 * - output_text: Generated text response
 * - usage: Token usage statistics (prompt_tokens, completion_tokens, total_tokens)
 * - model: Model identifier used
 * - reasoning: Reasoning effort and process (if enabled)
 * - metadata: Additional response metadata
 * - timing: Response timing information
 *
 * Since this is a testing/playground endpoint that intentionally supports arbitrary
 * prompts and models, maintaining a strict schema would require constant updates
 * and would limit the flexibility needed for prompt experimentation.
 *
 * @see AdminPromptService.testPrompts() for the implementation
 * @see AdminPromptService.gpt5Text() for the OpenAI API call details
 */
export const PlaygroundSchema = t.Any();

/**
 * Existing explanation - string or null (just the explanation text)
 * The getExistingExplanation method returns explanation?.explanation || null
 */
export const ExistingExplanationSchema = t.Optional(t.String());

/**
 * Stats response - complex object with explanation statistics
 * Fields: totalExplanations, explanationsByType, explanationsByBook, explanationsByVersion, recentActivity, lastUpdated
 */
export const StatsSchema = t.Object({
  totalExplanations: t.Number(),
  explanationsByType: t.Record(t.String(), t.Number()),
  explanationsByBook: t.Record(t.String(), t.Number()),
  explanationsByVersion: t.Record(t.String(), t.Number()),
  recentActivity: t.Array(t.Any()),
  lastUpdated: t.Union([t.String({ format: "date-time" }), t.Date()]),
});

/**
 * Commentary grades - complex object with grading results and statistics
 * Fields: message, grades[], stats: { total, averageGrade, gradingCriteria[] }
 * Note: grades array structure is TBD - using t.Any() until feature is fully implemented
 */
export const CommentaryGradeItemSchema = t.Object({
  explanation_id: t.Number(),
  grade: t.Number(),
  criteria: t.Array(t.String()),
  feedback: t.Optional(t.String()),
});

export const CommentaryGradesSchema = t.Object({
  message: t.String(),
  grades: t.Array(CommentaryGradeItemSchema),
  stats: t.Object({
    total: t.Number(),
    averageGrade: t.Number(),
    gradingCriteria: t.Array(
      t.Object({
        name: t.Optional(t.String()),
        weight: t.Optional(t.Number()),
      }),
    ),
  }),
});

/**
 * Explanations filter result - explanations array with total count
 * Fields: explanations[] (full explanation records from database), total
 */
export const ExplanationFilterItemSchema = t.Object({
  explanation_id: t.Number(),
  type: t.String(),
  explanation: t.String(),
  chapter_id: t.Number(),
  version: t.Number(),
  is_active: t.Boolean(),
  created_by_admin: t.Boolean(),
  parent_explanation_id: t.Optional(t.Number()),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date()]),
  language_code: t.String(),
});

export const ExplanationsFilterSchema = t.Object({
  explanations: t.Array(ExplanationFilterItemSchema),
  total: t.Number(),
});
