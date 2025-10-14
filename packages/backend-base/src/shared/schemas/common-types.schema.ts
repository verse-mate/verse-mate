import ExplanationTypeEnumDB from "database/src/models/public/ExplanationTypeEnum";
import FavoriteTypeEnumDB from "database/src/models/public/FavoriteTypeEnum";
import HighlightColorEnumDB from "database/src/models/public/HighlightColorEnum";
import PromptStatusEnumDB from "database/src/models/public/PromptStatusEnum";
import RoleEnumDB from "database/src/models/public/RoleEnum";
import StatusEnumDB from "database/src/models/public/StatusEnum";
import TestamentEnumDB from "database/src/models/public/TestamentEnum";
import { type Static, t } from "elysia";

/**
 * Common reusable type definitions for OpenAPI schemas
 * These types are used across multiple plugins to ensure consistency
 */

// ============================================================================
// Enum Types
// ============================================================================

/**
 * Testament enum matching database TestamentEnum
 */
export const TestamentEnum = t.Enum(TestamentEnumDB);

/**
 * Explanation type enum matching database ExplanationTypeEnum
 */
export const ExplanationTypeEnum = t.Enum(ExplanationTypeEnumDB);

/**
 * Chat message role enum matching database RoleEnum
 */
export const RoleEnum = t.Enum(RoleEnumDB);

/**
 * Status enum matching database StatusEnum
 */
export const StatusEnum = t.Enum(StatusEnumDB);

/**
 * Highlight color enum matching database HighlightColorEnum
 */
export const HighlightColorEnum = t.Enum(HighlightColorEnumDB);

/**
 * Favorite type enum matching database FavoriteTypeEnum
 */
export const FavoriteTypeEnum = t.Enum(FavoriteTypeEnumDB);

/**
 * Prompt status enum matching database PromptStatusEnum
 */
export const PromptStatusEnum = t.Enum(PromptStatusEnumDB);

// ============================================================================
// Bible Content Types
// ============================================================================

/**
 * Book type - represents a Bible book
 * Compact format with abbreviated field names (b, n, t, g, c)
 */
export const BookTypeCompact = t.Object({
  b: t.Number(), // bookId
  n: t.String(), // name
  t: TestamentEnum, // testament
  g: t.Number(), // genre_id
  c: t.Number(), // chapters count
});

/**
 * Book type - full format with descriptive field names
 */
export const BookType = t.Object({
  bookId: t.Number(),
  name: t.String(),
  testament: TestamentEnum,
  genre: t.String(),
  chapters: t.Number(),
});

/**
 * Verse type - represents a single Bible verse
 */
export const VerseType = t.Object({
  verse_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_number: t.Number(),
  verse_text: t.String(),
  version_id: t.Union([t.Number(), t.Null()]),
});

/**
 * Subtitle type - represents a section heading in a chapter
 */
export const SubtitleType = t.Object({
  subtitle_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_number: t.Number(),
  subtitle_text: t.String(),
});

/**
 * Chapter type - complete chapter with verses, subtitles, and explanations
 */
export const ChapterType = t.Object({
  book_id: t.Number(),
  chapter_number: t.Number(),
  verses: t.Array(VerseType),
  subtitles: t.Union([t.Array(SubtitleType), t.Null()]),
  explanations: t.Union([t.Array(t.Any()), t.Null()]), // Will be replaced with ExplanationType later
});

/**
 * Testament type - represents a testament with its books
 */
export const TestamentType = t.Object({
  testament: TestamentEnum,
  books: t.Array(BookType),
});

/**
 * Language type - represents an explanation language
 */
export const LanguageType = t.Object({
  language_id: t.Number(),
  language_code: t.String(),
  language_name: t.String(),
  is_active: t.Boolean(),
  created_at: t.String(), // ISO date string
});

// ============================================================================
// Explanation Types
// ============================================================================

/**
 * Explanation type - represents an AI-generated chapter explanation
 */
export const ExplanationType = t.Object({
  explanation_id: t.Number(),
  chapter_id: t.Number(),
  explanation_type: ExplanationTypeEnum,
  explanation_text: t.String(),
  language_id: t.Number(),
  is_active: t.Boolean(),
  version: t.Number(),
  parent_explanation_id: t.Union([t.Number(), t.Null()]),
  created_at: t.String(), // ISO date string
});

/**
 * Explanation rating type - represents a user's rating of an explanation
 */
export const ExplanationRatingType = t.Object({
  rating_id: t.Number(),
  explanation_id: t.Number(),
  user_id: t.Number(),
  rating_value: t.Number(),
  created_at: t.String(), // ISO date string
});

/**
 * Rating summary type - aggregated ratings for an explanation
 */
export const RatingSummaryType = t.Object({
  userRating: t.Union([t.Number(), t.Null()]),
  totalUsersWhoRated: t.Number(),
  averageRating: t.Union([t.Number(), t.Null()]),
});

// ============================================================================
// Chat & Conversation Types
// ============================================================================

/**
 * Conversation type - represents a chat conversation (simple version for database records)
 */
export const ConversationType = t.Object({
  conversation_id: t.Number(),
  user_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  title: t.Union([t.String(), t.Null()]),
  created_at: t.String(), // ISO date string
  updated_at: t.String(), // ISO date string
});

/**
 * Message type - represents a chat message (full version with metadata)
 */
export const MessageType = t.Object({
  message_id: t.Number(),
  conversation_id: t.Number(),
  role: RoleEnum,
  content: t.String(),
  created_at: t.String(), // ISO date string
});

/**
 * Simple message type - used in conversation context (no conversation_id or timestamp needed)
 */
const SimpleMessageType = t.Object({
  message_id: t.Number(),
  content: t.String(),
  role: RoleEnum,
});

/**
 * Book reference in chat - minimal book info for chat context
 */
const ChatBookReferenceType = t.Object({
  book_id: t.Union([t.Number(), t.Null()]),
  name: t.Union([t.String(), t.Null()]),
  testament: t.Union([TestamentEnum, t.Null()]),
  genre_id: t.Union([t.Number(), t.Null()]),
});

/**
 * Rich conversation type - used in chat history with messages and book info
 */
export const RichConversationType = t.Object({
  conversation_id: t.Number(),
  user_id: t.String(), // UUID
  title: t.String(),
  status: StatusEnum,
  updated_at: t.String(), // ISO date string (serialized from Date)
  book: ChatBookReferenceType,
  chapter_number: t.Union([t.Number(), t.Null()]),
  messages: t.Array(SimpleMessageType),
});

/**
 * Grouped chat history type - conversations grouped by time period
 * Uses RichConversationType which includes messages and book info
 */
export const GroupedChatHistoryType = t.Object({
  today: t.Array(RichConversationType),
  yesterday: t.Array(RichConversationType),
  lastSevenDays: t.Array(RichConversationType),
  older: t.Array(RichConversationType),
});

// ============================================================================
// User Content Types
// ============================================================================

/**
 * Bookmark (Favorite) type - represents a favorited chapter or message
 */
export const BookmarkType = t.Object({
  favorite_id: t.Number(),
  user_id: t.Number(),
  favorite_type: FavoriteTypeEnum,
  chapter_id: t.Union([t.Number(), t.Null()]),
  message_id: t.Union([t.Number(), t.Null()]),
  created_at: t.String(), // ISO date string
});

/**
 * Note type - represents a user's note on a verse or chapter
 */
export const NoteType = t.Object({
  note_id: t.Number(),
  user_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_id: t.Union([t.Number(), t.Null()]),
  note_text: t.String(),
  created_at: t.String(), // ISO date string
  updated_at: t.String(), // ISO date string
});

/**
 * Highlight type - represents highlighted text in a verse
 */
export const HighlightType = t.Object({
  highlight_id: t.Number(),
  user_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  start_verse: t.Number(),
  end_verse: t.Number(),
  start_char: t.Union([t.Number(), t.Null()]),
  end_char: t.Union([t.Number(), t.Null()]),
  selected_text: t.Union([t.String(), t.Null()]),
  color: HighlightColorEnum,
  created_at: t.String(), // ISO date string
});

/**
 * User progress type - represents user's reading progress
 */
export const UserProgressType = t.Object({
  progress_id: t.Number(),
  user_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  last_verse_read: t.Union([t.Number(), t.Null()]),
  updated_at: t.String(), // ISO date string
});

// ============================================================================
// User Types
// ============================================================================

/**
 * User type - represents a user account (for admin endpoints)
 */
export const UserType = t.Object({
  id: t.Number(),
  email: t.String(),
  firstName: t.Union([t.String(), t.Null()]),
  lastName: t.Union([t.String(), t.Null()]),
  is_admin: t.Boolean(),
  preferred_language: t.Union([t.String(), t.Null()]),
  created_at: t.String(), // ISO date string
  updated_at: t.String(), // ISO date string
});

// ============================================================================
// Batch Operation Types
// ============================================================================

/**
 * Batch job status type - simplified status for API responses
 */
export const BatchJobStatusType = t.Object({
  batchJobId: t.String(),
  status: t.String(),
  progress: t.Number(),
  total: t.Number(),
  completed: t.Number(),
  failed: t.Number(),
});

/**
 * Batch job type - represents an OpenAI batch processing job
 */
export const BatchJobType = t.Object({
  batch_job_id: t.String(),
  openai_batch_id: t.Union([t.String(), t.Null()]),
  batch_type: t.String(),
  status: t.String(),
  book_id: t.Union([t.Number(), t.Null()]),
  language_id: t.Union([t.Number(), t.Null()]),
  explanation_type: t.Union([ExplanationTypeEnum, t.Null()]),
  total_requests: t.Number(),
  completed_requests: t.Number(),
  failed_requests: t.Number(),
  input_file_id: t.Union([t.String(), t.Null()]),
  output_file_id: t.Union([t.String(), t.Null()]),
  error_file_id: t.Union([t.String(), t.Null()]),
  input_tokens: t.Union([t.Number(), t.Null()]),
  output_tokens: t.Union([t.Number(), t.Null()]),
  estimated_cost: t.Union([t.Number(), t.Null()]),
  parent_batch_id: t.Union([t.String(), t.Null()]),
  created_at: t.String(), // ISO date string
  updated_at: t.String(), // ISO date string
  completed_at: t.Union([t.String(), t.Null()]),
});

// ============================================================================
// Prompt Types
// ============================================================================

/**
 * System prompt type - represents a system-level AI prompt
 */
export const SystemPromptType = t.Object({
  prompt_id: t.Number(),
  prompt_type: t.String(),
  prompt_text: t.String(),
  language_id: t.Union([t.Number(), t.Null()]),
  status: PromptStatusEnum,
  is_default: t.Boolean(),
  created_at: t.String(), // ISO date string
  updated_at: t.String(), // ISO date string
});

/**
 * User prompt template type - represents a user-defined prompt template
 */
export const UserPromptTemplateType = t.Object({
  template_id: t.Number(),
  user_id: t.Number(),
  template_name: t.String(),
  template_text: t.String(),
  prompt_type: t.String(),
  created_at: t.String(), // ISO date string
  updated_at: t.String(), // ISO date string
});

// ============================================================================
// Response Wrapper Types
// ============================================================================

/**
 * Success response type - generic success response
 */
export const SuccessResponseType = t.Object({
  success: t.Boolean(),
  message: t.Optional(t.String()),
});

/**
 * Count response type - response with a count
 */
export const CountResponseType = t.Object({
  count: t.Number(),
  message: t.Optional(t.String()),
});

// ============================================================================
// Type Exports (for TypeScript usage)
// ============================================================================

export type Testament = Static<typeof TestamentEnum>;
export type ExplanationType_Enum = Static<typeof ExplanationTypeEnum>;
export type Role = Static<typeof RoleEnum>;
export type Status = Static<typeof StatusEnum>;
export type HighlightColor = Static<typeof HighlightColorEnum>;
export type FavoriteType = Static<typeof FavoriteTypeEnum>;
export type PromptStatus = Static<typeof PromptStatusEnum>;

export type Book = Static<typeof BookType>;
export type BookCompact = Static<typeof BookTypeCompact>;
export type Verse = Static<typeof VerseType>;
export type Subtitle = Static<typeof SubtitleType>;
export type Chapter = Static<typeof ChapterType>;
export type Testament_Type = Static<typeof TestamentType>;
export type Language = Static<typeof LanguageType>;

export type Explanation = Static<typeof ExplanationType>;
export type ExplanationRating = Static<typeof ExplanationRatingType>;
export type RatingSummary = Static<typeof RatingSummaryType>;

export type Conversation = Static<typeof ConversationType>;
export type Message = Static<typeof MessageType>;
export type GroupedChatHistory = Static<typeof GroupedChatHistoryType>;

export type Bookmark = Static<typeof BookmarkType>;
export type Note = Static<typeof NoteType>;
export type Highlight = Static<typeof HighlightType>;
export type UserProgress = Static<typeof UserProgressType>;

export type User = Static<typeof UserType>;

export type BatchJobStatus = Static<typeof BatchJobStatusType>;
export type BatchJob = Static<typeof BatchJobType>;

export type SystemPrompt = Static<typeof SystemPromptType>;
export type UserPromptTemplate = Static<typeof UserPromptTemplateType>;

export type SuccessResponse = Static<typeof SuccessResponseType>;
export type CountResponse = Static<typeof CountResponseType>;
