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
  t: t.Optional(t.Union([t.Literal("OT"), t.Literal("NT")])), // testament
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
  verse_number: t.Optional(t.Number()),
});

export const HighlightSchema = t.Object({
  highlight_id: t.Number(),
  user_id: t.String({ format: "uuid" }),
  chapter_id: t.Number(),
  start_verse: t.Number(),
  end_verse: t.Number(),
  color: t.String(),
  start_char: t.Optional(t.Number()),
  end_char: t.Optional(t.Number()),
  selected_text: t.Optional(t.String()),
  created_at: t.Optional(
    t.Union([t.String({ format: "date-time" }), t.Date()]),
  ), // Can be Date from DB
  updated_at: t.Optional(
    t.Union([t.String({ format: "date-time" }), t.Date()]),
  ), // Can be Date from DB
});

export const ExplanationSchema = t.Object({
  explanation_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  type: t.String(),
  explanation: t.String(),
  language_code: t.String(),
});

// ========== Complex Types ==========

/**
 * Book structure from parseBibleData() - used by /books endpoint
 * Contains full book data loaded from JSON files with ALL chapters
 * Uses chapterId and verseId (from JSON structure)
 */
export const BookSchema = t.Object({
  bookId: t.Number(),
  name: t.String(),
  testament: t.Union([t.Literal("OT"), t.Literal("NT")]),
  genre: t.Object({
    g: t.Number(),
    n: t.String(),
  }),
  chapters: t.Array(
    t.Object({
      chapterId: t.Number(),
      subtitles: t.Array(
        t.Object({
          subtitle: t.String(),
          start_verse: t.Number(),
          end_verse: t.Number(),
        }),
      ),
      verses: t.Array(
        t.Object({
          verseId: t.Number(),
          text: t.String(),
        }),
      ),
    }),
  ),
});

/**
 * Single chapter book structure returned by BibleService.getBook()
 * Used by /book/:bookId/:chapterNumber endpoint
 * Can be either:
 * 1. { book: SingleChapterBook } - Successfully retrieved book with one chapter
 * 2. { message: string } - Error message (e.g., "Book not found", "Chapter not found")
 *
 * Contains book metadata with a SINGLE chapter's data from database
 * Uses chapterNumber and verseNumber (from database structure)
 */
export const SingleChapterBookSchema = t.Union([
  t.Object({
    book: t.Union([
      t.Object({
        bookId: t.Number(),
        name: t.String(),
        testament: t.Union([t.Literal("OT"), t.Literal("NT")]),
        genre: t.Object({
          g: t.Optional(t.Number()),
          n: t.Optional(t.String()),
        }),
        chapters: t.Array(
          t.Object({
            chapterNumber: t.Number(),
            subtitles: t.Array(
              t.Object({
                subtitle: t.String(),
                start_verse: t.Number(),
                end_verse: t.Number(),
              }),
            ),
            verses: t.Array(
              t.Object({
                verseNumber: t.Number(),
                text: t.String(),
              }),
            ),
          }),
        ),
      }),
      t.Null(),
    ]),
  }),
  t.Object({ message: t.String() }),
]);

/**
 * Last chapter read structure with explanation array
 * Fields: book_id, chapterNumber, bookName, testament, explanation[]
 */
export const LastChapterReadSchema = t.Object({
  book_id: t.Number(),
  chapterNumber: t.Number(),
  bookName: t.String(),
  testament: t.Union([t.Literal("OT"), t.Literal("NT")]),
  explanation: t.Array(
    t.Object({
      book_id: t.Number(),
      chapter_number: t.Number(),
      explanation_id: t.Optional(t.Number()),
      type: t.Optional(t.String()),
      explanation: t.Optional(t.String()),
    }),
  ),
});

/**
 * Individual chat item within grouped chat history
 * Contains conversation metadata, associated book/chapter, and messages
 */
const ChatItemSchema = t.Object({
  conversation_id: t.Number(),
  user_id: t.String({ format: "uuid" }),
  title: t.String(),
  status: t.String(),
  updated_at: t.Date(),
  book: t.Object({
    book_id: t.Optional(t.Number()),
    name: t.Optional(t.String()),
    testament: t.Optional(t.Union([t.Literal("OT"), t.Literal("NT")])),
    genre_id: t.Optional(t.Number()),
  }),
  chapter_number: t.Optional(t.Number()),
  messages: t.Array(
    t.Object({
      message_id: t.Number(),
      content: t.String(),
      role: t.String(),
    }),
  ),
});

/**
 * Grouped chat history - chats organized by time periods
 * Structure: Record<string, ChatItemSchema[]>
 * Keys are period labels (e.g., "today", "yesterday", "lastSevenDays", "older")
 * generated by ChatHistoryGrouper based on chat.updated_at timestamps
 */
export const GroupedChatHistorySchema = t.Record(
  t.String(),
  t.Array(ChatItemSchema),
);

/**
 * Message history - complex array with book/chapter/conversation metadata
 * Each message has extra fields beyond basic message data
 */
export const MessageHistorySchema = t.Array(
  t.Object({
    conversation_id: t.Number(),
    user_id: t.String({ format: "uuid" }),
    title: t.String(),
    status: t.String(),
    updated_at: t.Optional(
      t.Union([t.String({ format: "date-time" }), t.Date()]),
    ),
    message_id: t.Optional(t.Number()),
    content: t.Optional(t.String()),
    role: t.Optional(t.String()),
    chapter_number: t.Optional(t.Number()),
    book_id: t.Optional(t.Number()),
    bookName: t.Optional(t.String()),
    bookTestament: t.Optional(t.String()),
    genreId: t.Optional(t.Number()),
  }),
);

/**
 * New conversation result - union of { message: string } | { chat_id: number, message: string }
 * Structure varies based on whether chat creation succeeded
 */
export const NewConversationSchema = t.Union([
  t.Object({ message: t.String() }),
  t.Object({ chat_id: t.Number(), message: t.String() }),
]);

/**
 * Save rating result - { message: string }
 */
export const SaveRatingResultSchema = t.Object({
  message: t.String(),
});

/**
 * Update rating result - { success: string } | { error: string }
 */
export const UpdateRatingResultSchema = t.Union([
  t.Object({ success: t.String() }),
  t.Object({ error: t.String() }),
]);

/**
 * Save last chapter read result - { message: string }
 */
export const SaveLastChapterReadResultSchema = t.Object({
  message: t.String(),
});

/**
 * Message save result - partial message with just message_id, or undefined
 * Structure: { message_id?: number } | undefined
 */
export const MessageSaveResultSchema = t.Union([
  t.Object({ message_id: t.Optional(t.Number()) }),
  t.Undefined(),
]);
