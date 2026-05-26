import { t } from "elysia";
import {
  BookTypeCompact,
  ExplanationTypeEnum,
  GroupedChatHistoryType,
  HighlightColorEnum,
  MessageType,
  TestamentEnum,
} from "../../shared/schemas/common-types.schema";

/**
 * Book response schemas
 */

// Testament response - returns books array with compact format (note: no nested testaments object, just keys array)
export const TestamentsSchema = t.Object({
  testaments: t.Array(BookTypeCompact),
});

// Legacy BookSchema - parses Bible JSON and returns books from bible/types.ts format
// Uses different structure than BookTypeCompact (full names vs abbreviated)
// This is for /books endpoint which returns chapterId and verseId
// Uses string literals for testament because that's what the JSON parser returns
const LegacyBookType = t.Object({
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

export const BookSchema = t.Object({
  books: t.Array(LegacyBookType),
});

// ChapterBookType - for /book/:bookId/:chapterNumber endpoint which returns chapterNumber and verseNumber
// Uses string literals for testament to match the actual data structure
const ChapterBookType = t.Object({
  bookId: t.Number(),
  name: t.String(),
  testament: t.Union([t.Literal("OT"), t.Literal("NT")]),
  genre: t.Object({
    g: t.Number(),
    n: t.Union([t.String(), t.Null()]),
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
      // Per-verse: `text` is always present (back-compat). `tokens` is
      // additive — populated only when the caller passes `?tagged=1` AND
      // the row has Strong's data seeded. Joining `tokens[*].text`
      // reproduces `text` byte-for-byte.
      verses: t.Array(
        t.Object({
          verseNumber: t.Number(),
          text: t.String(),
          tokens: t.Optional(
            t.Array(
              t.Object({
                text: t.String(),
                strongs: t.Optional(t.String()),
                strongs_alt: t.Optional(t.Array(t.String())),
                confidence: t.Optional(t.Number()),
              }),
            ),
          ),
        }),
      ),
    }),
  ),
});

// Languages response - explanation languages with stats
export const LanguagesSchema = t.Array(
  t.Object({
    language_code: t.String(),
    name: t.String(),
    native_name: t.String(),
    explanation_count: t.Number(),
  }),
);

// Bible versions response - available translations with license/attribution
export const BibleVersionsSchema = t.Object({
  versions: t.Array(
    t.Object({
      version_key: t.String(),
      version_name: t.String(),
      language_code: t.String(),
      license: t.Union([t.String(), t.Null()]),
      license_url: t.Union([t.String(), t.Null()]),
      attribution: t.Union([t.String(), t.Null()]),
      testament_coverage: t.String(),
    }),
  ),
});

// Chapter response - returns book object with chapter details
// Can return either { book: ..., message?: string } or { message: string }
export const ChapterSchema = t.Union([
  t.Object({
    book: t.Union([ChapterBookType, t.Null()]),
    message: t.Optional(t.String()),
  }),
  t.Object({
    message: t.String(),
  }),
]);

// Explanation response - can be null if not found
export const ExplanationSchema = t.Object({
  explanation: t.Union([
    t.Object({
      book_id: t.Number(),
      chapter_number: t.Number(),
      type: ExplanationTypeEnum,
      explanation: t.Union([t.String(), t.Null()]),
      explanation_id: t.Number(),
      language_code: t.String(),
    }),
    t.Null(),
  ]),
});

export const ChapterIdSchema = t.Object({
  chapter_id: t.Union([t.Number(), t.Null()]),
});

/**
 * Chat and conversation schemas
 */
export const UserChatHistorySchema = t.Object({
  userChatHistory: GroupedChatHistoryType, // Grouped chat history object with periods (today, yesterday, etc.)
});

export const MessagesHistorySchema = t.Object({
  messagesHistory: t.Array(MessageType),
});

export const ChatExistsSchema = t.Object({
  chatExists: t.Boolean(),
});

export const NewConversationSchema = t.Object({
  newConversation: t.Object({
    chat_id: t.Number(),
    message: t.String(),
  }),
  generatedTitle: t.String(),
});

export const SavedMessageSchema = t.Object({
  result: MessageType,
});

export const DisabledChatSchema = t.Object({
  disabledChat: t.Number(),
});

/**
 * Rating schemas
 */
export const RatingSaveSchema = t.Object({
  result: t.Object({
    message: t.String(),
  }),
});

export const RatingsSchema = t.Object({
  userRating: t.Number(),
  totalUsersWhoRated: t.Number(),
  averageRating: t.Number(),
});

/**
 * Last chapter read schemas
 */
// saveLastChapterRead() returns: { message: string }
export const LastChapterReadSaveSchema = t.Object({
  result: t.Object({
    message: t.String(),
  }),
});

// lastChapterReadByUser() returns: { book_id, chapterNumber, bookName, testament, explanation[] } | null
export const LastChapterReadSchema = t.Object({
  result: t.Union([
    t.Object({
      book_id: t.Number(),
      chapterNumber: t.Number(),
      bookName: t.String(),
      testament: TestamentEnum,
      explanation: t.Array(
        t.Object({
          book_id: t.Number(),
          chapter_number: t.Number(),
          explanation_id: t.Union([t.Number(), t.Null()]),
          type: t.Union([ExplanationTypeEnum, t.Null()]),
          explanation: t.Union([t.String(), t.Null()]),
        }),
      ),
    }),
    t.Null(),
  ]),
});

/**
 * Bookmark schemas
 */
// Bookmark response from repository (getFavorites) - includes book_name computed field
const BookmarkResponseType = t.Object({
  favorite_id: t.Number(),
  chapter_number: t.Number(),
  book_id: t.Number(),
  book_name: t.String(),
});

export const BookmarksSchema = t.Object({
  favorites: t.Array(BookmarkResponseType),
});

export const BookmarkActionSchema = t.Object({
  success: t.Boolean(),
});

/**
 * Note schemas
 */
// Note response from repository (getNotes) - includes book_name and verse_number computed fields
const NoteResponseType = t.Object({
  note_id: t.String(), // UUID
  content: t.String(),
  created_at: t.String(), // ISO date string (Date object serialized)
  updated_at: t.String(), // ISO date string (Date object serialized)
  chapter_number: t.Number(),
  book_id: t.Number(),
  book_name: t.String(),
  verse_number: t.Union([t.Number(), t.Null()]),
});

// Note returned from addNote() - different structure (database fields)
const NoteCreatedType = t.Object({
  note_id: t.String(), // UUID
  user_id: t.String(), // UUID
  chapter_id: t.Number(),
  verse_id: t.Union([t.Number(), t.Null()]),
  content: t.String(),
  created_at: t.String(), // ISO date string
  updated_at: t.String(), // ISO date string
});

export const NotesSchema = t.Object({
  notes: t.Array(NoteResponseType),
});

export const NoteAddSchema = t.Object({
  success: t.Boolean(),
  note: NoteCreatedType,
});

export const NoteUpdateSchema = t.Object({
  success: t.Boolean(),
});

export const NoteDeleteSchema = t.Object({
  success: t.Boolean(),
});

/**
 * TypeScript interface for note before serialization (from database)
 * Used in the plugin layer for type safety when serializing dates
 */
export interface NoteFromDatabase {
  note_id: string;
  content: string;
  created_at: Date | string;
  updated_at: Date | string;
  chapter_number: number;
  book_id: number;
  book_name: string;
  verse_number: number | null;
}

/**
 * Highlight schemas
 */
// Highlight response from repository - has chapter_id and Date objects
const HighlightResponseType = t.Object({
  highlight_id: t.Number(),
  user_id: t.String(), // UUID
  chapter_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  start_verse: t.Number(),
  end_verse: t.Number(),
  color: HighlightColorEnum,
  start_char: t.Union([t.Number(), t.Null()]),
  end_char: t.Union([t.Number(), t.Null()]),
  selected_text: t.Union([t.String(), t.Null()]),
  created_at: t.String(), // ISO date string (Date serialized)
  updated_at: t.String(), // ISO date string (Date serialized)
});

export const HighlightsSchema = t.Object({
  highlights: t.Array(HighlightResponseType),
});

// createHighlight() returns { highlight, success } or { success: false, error, overlaps? }
export const HighlightAddSchema = t.Union([
  t.Object({
    highlight: HighlightResponseType,
    success: t.Literal(true),
  }),
  t.Object({
    success: t.Literal(false),
    error: t.String(),
    overlaps: t.Optional(t.Array(t.Any())),
  }),
]);

export const HighlightUpdateSchema = t.Object({
  highlight: t.Union([HighlightResponseType, t.Null()]),
  success: t.Boolean(),
});

export const HighlightDeleteSchema = t.Object({
  success: t.Boolean(),
});

// Book introduction schemas
export const BookIntroductionSchema = t.Object({
  introduction: t.Union([
    t.Object({
      introduction_id: t.String(),
      book_id: t.Number(),
      author: t.String(),
      date_written: t.String(),
      biblical_role: t.String(),
      key_themes: t.Array(t.String()),
      related_books: t.String(),
      literary_style: t.String(),
      full_intro_text: t.String(),
      language_code: t.String(),
      version: t.Number(),
      is_active: t.Boolean(),
      created_by_admin: t.Boolean(),
      created_at: t.String(),
      updated_at: t.String(),
    }),
    t.Null(),
  ]),
  hasViewed: t.Optional(t.Boolean()),
});
