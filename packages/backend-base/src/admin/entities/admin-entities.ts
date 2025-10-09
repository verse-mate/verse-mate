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
export const UsersListSchema = t.Array(t.Any());

/**
 * Batch list - complex array with batch job metadata
 * Fields: various batch job fields from database
 */
export const BatchListSchema = t.Array(t.Any());

/**
 * Batch children - complex array with child batch information
 * Fields: child batch job details
 */
export const BatchChildrenSchema = t.Array(t.Any());

/**
 * Batch summary - complex object with batch statistics
 * Fields: summary, stats, child batches info
 */
export const BatchSummarySchema = t.Any();

/**
 * Monitor batch result - complex object with monitoring status
 * Fields: monitoring status, queued jobs info
 */
export const MonitorBatchSchema = t.Any();

/**
 * Delete explanation result - { success: boolean, message: string }
 */
export const DeleteExplanationSchema = t.Any();

/**
 * Explanation comparison - complex object with old/new explanation comparison
 * Fields: regeneration details, original/new explanation data
 */
export const ExplanationComparisonSchema = t.Any();

/**
 * Bulk delete result - { success: boolean, deletedCount: number, message: string }
 */
export const BulkDeleteSchema = t.Any();

/**
 * Set active default result - { success: boolean, affectedCount: number, message: string }
 */
export const SetActiveDefaultSchema = t.Any();

/**
 * Explanation history - complex array with explanation version history
 * Fields: version, explanation, created_at, is_active, etc.
 */
export const ExplanationHistorySchema = t.Any();

/**
 * System prompts list - complex array with system prompt details
 * Fields: id, prompt, status, created_at, etc.
 */
export const SystemPromptsListSchema = t.Array(t.Any());

/**
 * User prompts list - complex array with user prompt templates
 * Fields: id, template_name, explanation_type, prompt_template, status, etc.
 */
export const UserPromptsListSchema = t.Array(t.Any());

/**
 * Update prompt result - { success: boolean, message: string }
 */
export const UpdatePromptSchema = t.Any();

/**
 * Delete prompt result - { success: boolean, message: string }
 */
export const DeletePromptSchema = t.Any();

/**
 * Prompt status result - { success: boolean, message: string }
 */
export const PromptStatusSchema = t.Any();

/**
 * Restore defaults result - { success: boolean, message: string, restored: number }
 */
export const RestoreDefaultsSchema = t.Any();

/**
 * Playground result - complex object with AI response
 * Fields: explanation, usage, model, timing, etc.
 */
export const PlaygroundSchema = t.Any();

/**
 * Existing explanation - complex object with explanation details
 * Fields: explanation_id, explanation, book_id, chapter_number, type, etc.
 */
export const ExistingExplanationSchema = t.Any();

/**
 * Stats response - complex object with explanation statistics
 * Fields: various database statistics
 */
export const StatsSchema = t.Any();

/**
 * Commentary grades - complex object with grading results and statistics
 * Fields: message, grades[], stats: { total, averageGrade, gradingCriteria[] }
 */
export const CommentaryGradesSchema = t.Object({
  message: t.String(),
  grades: t.Array(t.Any()),
  stats: t.Object({
    total: t.Number(),
    averageGrade: t.Number(),
    gradingCriteria: t.Array(t.Any()),
  }),
});

/**
 * Explanations filter result - explanations array with total count
 * Fields: explanations[] (complex), total
 */
export const ExplanationsFilterSchema = t.Object({
  explanations: t.Array(t.Any()),
  total: t.Number(),
});
