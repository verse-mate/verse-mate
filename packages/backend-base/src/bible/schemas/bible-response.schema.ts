import { t } from "elysia";
import {
  BookTypeCompact,
  ExplanationType,
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
const LegacyBookType = t.Object({
  bookId: t.Number(),
  name: t.String(),
  testament: TestamentEnum,
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

// Languages response - explanation languages with stats
export const LanguagesSchema = t.Array(
  t.Object({
    language_code: t.String(),
    name: t.String(),
    native_name: t.String(),
    explanation_count: t.Number(),
  }),
);

// Chapter response - returns book object with chapter details
export const ChapterSchema = t.Object({
  book: t.Union([LegacyBookType, t.Null()]),
  message: t.Optional(t.String()),
});

// Explanation response
export const ExplanationSchema = t.Object({
  explanation: ExplanationType,
});

export const ChapterIdSchema = t.Object({
  chapter_id: t.Union([t.Number(), t.Null()]),
});

/**
 * Chat and conversation schemas
 */
export const UserChatHistorySchema = t.Object({
  userChatHistory: t.Any(), // Grouped chat history object with periods (today, yesterday, etc.)
});

export const MessagesHistorySchema = t.Object({
  messagesHistory: t.Array(t.Any()),
});

export const ChatExistsSchema = t.Object({
  chatExists: t.Boolean(),
});

export const NewConversationSchema = t.Object({
  newConversation: t.Any(),
  generatedTitle: t.String(),
});

export const SavedMessageSchema = t.Object({
  result: t.Any(),
});

export const DisabledChatSchema = t.Object({
  disabledChat: t.Number(),
});

/**
 * Rating schemas
 */
export const RatingSaveSchema = t.Object({
  result: t.Any(),
});

export const RatingsSchema = t.Object({
  userRating: t.Any(),
  totalUsersWhoRated: t.Any(),
  averageRating: t.Any(),
});

/**
 * Last chapter read schemas
 */
export const LastChapterReadSaveSchema = t.Object({
  result: t.Any(),
});

export const LastChapterReadSchema = t.Object({
  result: t.Any(),
});

/**
 * Bookmark schemas
 */
export const BookmarksSchema = t.Object({
  favorites: t.Array(t.Any()),
});

export const BookmarkActionSchema = t.Object({
  success: t.Boolean(),
});

/**
 * Note schemas
 */
export const NotesSchema = t.Object({
  notes: t.Array(t.Any()),
});

export const NoteAddSchema = t.Object({
  success: t.Boolean(),
  note: t.Any(),
});

export const NoteUpdateSchema = t.Object({
  success: t.Boolean(),
});

export const NoteDeleteSchema = t.Object({
  success: t.Boolean(),
});

/**
 * Highlight schemas
 */
export const HighlightsSchema = t.Object({
  highlights: t.Array(t.Any()),
});

export const HighlightAddSchema = t.Any(); // Returns highlight object directly

export const HighlightUpdateSchema = t.Object({
  highlight: t.Any(),
  success: t.Boolean(),
});

export const HighlightDeleteSchema = t.Object({
  success: t.Boolean(),
});
