import { t } from "elysia";

/**
 * Bible Plugin Response Entities
 *
 * These TypeBox schemas define output entities for bible.plugin.ts endpoints.
 * DTOs are for input, entities are for output (response types).
 * Use t.Any() with JSDoc for complex/dynamic structures that are hard to type precisely.
 */

// ========== Simple Value Types ==========

export const LanguageSchema = t.Object({
  language_code: t.String(),
  name: t.String(),
  native_name: t.String(),
  explanation_count: t.Number(),
});

export const TestamentSchema = t.Object({
  b: t.Number(), // book_id
  c: t.Number(), // total_chapters
  n: t.String(), // name
  t: t.Union([t.Literal("OT"), t.Literal("NT"), t.Null()]), // testament
  g: t.Union([t.String(), t.Number()]), // genre_id
});

export const BookmarkSchema = t.Object({
  favorite_id: t.Number(),
  chapter_number: t.Number(),
  book_id: t.Number(),
  book_name: t.String(),
});

export const NoteSchema = t.Object({
  note_id: t.String({ format: "uuid" }),
  content: t.String(),
  created_at: t.String({ format: "date-time" }),
  updated_at: t.String({ format: "date-time" }),
  chapter_number: t.Number(),
  book_id: t.Number(),
  book_name: t.String(),
  verse_number: t.Union([t.Number(), t.Null()]),
});

export const HighlightSchema = t.Object({
  highlight_id: t.Number(),
  user_id: t.String({ format: "uuid" }),
  chapter_id: t.Number(),
  start_verse: t.Number(),
  end_verse: t.Number(),
  color: t.String(),
  start_char: t.Union([t.Number(), t.Null()]),
  end_char: t.Union([t.Number(), t.Null()]),
  selected_text: t.Union([t.String(), t.Null()]),
  created_at: t.Union([t.String({ format: "date-time" }), t.Date(), t.Null()]), // Can be Date from DB
  updated_at: t.Union([t.String({ format: "date-time" }), t.Date(), t.Null()]), // Can be Date from DB
});

export const ExplanationSchema = t.Object({
  explanation_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  type: t.String(),
  explanation: t.String(),
  language_code: t.String(),
});

// ========== Complex Types (keeping as t.Any()) ==========

/**
 * Book structure from Bible JSON - complex nested structure with chapters/verses
 * Fields: bookId, name, testament, genre, chapters[]
 */
export const BookSchema = t.Any();

/**
 * Last chapter read structure with explanation array
 * Fields: book_id, chapterNumber, bookName, testament, explanation[]
 */
export const LastChapterReadSchema = t.Any();

/**
 * Grouped chat history - dynamic Record<string, ChatDto[]>
 * Keys: "today", "yesterday", "lastSevenDays", etc.
 */
export const GroupedChatHistorySchema = t.Any();

/**
 * Message history - complex array with book/chapter/conversation metadata
 * Each message has extra fields beyond basic message data
 */
export const MessageHistorySchema = t.Any();

/**
 * New conversation result - union of { message: string } | { chat_id: number, message: string }
 * Structure varies based on whether chat creation succeeded
 */
export const NewConversationSchema = t.Any();

/**
 * Save rating result - { message: string }
 */
export const SaveRatingResultSchema = t.Any();

/**
 * Update rating result - { success: string } | { error: string }
 */
export const UpdateRatingResultSchema = t.Any();

/**
 * Save last chapter read result - { message: string }
 */
export const SaveLastChapterReadResultSchema = t.Any();

/**
 * Message save result - partial message with just message_id, or undefined
 * Structure: { message_id?: number } | undefined
 */
export const MessageSaveResultSchema = t.Any();
