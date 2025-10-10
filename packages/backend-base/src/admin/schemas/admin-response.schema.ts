import { t } from "elysia";

/**
 * Admin response schemas using t.Any() for complex service responses
 * This approach provides OpenAPI documentation while avoiding over-specification
 */

// User preferences
export const UserPreferencesUpdateSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

// Languages and stats
// getAvailableExplanationLanguages() returns: language_code, name, native_name, explanation_count
const AdminLanguageType = t.Object({
  language_code: t.String(),
  name: t.String(),
  native_name: t.String(),
  explanation_count: t.Number(),
});

export const LanguagesArraySchema = t.Array(AdminLanguageType);
export const StatsSchema = t.Any();

// Users
// Admin /users endpoint returns: id (UUID string), email, firstName, lastName, is_admin, createdAt
const AdminUserType = t.Object({
  id: t.String({ format: "uuid" }),
  email: t.String(),
  firstName: t.Union([t.String(), t.Null()]),
  lastName: t.Union([t.String(), t.Null()]),
  is_admin: t.Boolean(),
  createdAt: t.String(), // ISO date string (Date object serialized)
});

export const UsersArraySchema = t.Array(AdminUserType);
export const AdminStatusUpdateSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});

// Batch operations
export const BatchOperationSchema = t.Any();
export const BatchStatusSchema = t.Object({
  id: t.String(),
  status: t.String(),
  progress: t.Number(),
  total: t.Number(),
  completed: t.Number(),
  failed: t.Number(),
});
export const BatchCancelSchema = t.Object({
  success: t.Boolean(),
  message: t.String(),
});
export const BatchHistorySchema = t.Any();
export const BatchChildrenSchema = t.Any();
export const BatchSummarySchema = t.Any();

// Explanations
export const ExplanationDeleteSchema = t.Any();
export const ExplanationRegenerateSchema = t.Any();
export const ExplanationGenerateSchema = t.Any();
export const ExplanationComparisonSchema = t.Any();
export const ExplanationChooseSchema = t.Any();
export const ExplanationsBulkDeleteSchema = t.Any();
export const ExplanationsSetActiveSchema = t.Any();
export const ExplanationHistorySchema = t.Any();
export const ExplanationsFilterSchema = t.Any();

// Prompts
export const SystemPromptsSchema = t.Any();
export const UserPromptsSchema = t.Any();
export const ExplanationTypesSchema = t.Any();
export const PromptCreateSchema = t.Any();
export const PromptUpdateSchema = t.Any();
export const PromptDeleteSchema = t.Any();
export const PromptStatusUpdateSchema = t.Any();
export const RestoreDefaultsSchema = t.Any();
export const PlaygroundSchema = t.Any();
export const ExistingExplanationSchema = t.Any();

// Commentary grading
export const CommentaryGradesSchema = t.Object({
  message: t.String(),
  grades: t.Array(t.Any()),
  stats: t.Object({
    total: t.Number(),
    averageGrade: t.Number(),
    gradingCriteria: t.Array(t.Any()),
  }),
});
export const CommentaryGradeSchema = t.Object({
  success: t.Boolean(),
  grade: t.Number(),
  message: t.String(),
});
