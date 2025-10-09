import { t } from "elysia";

/**
 * Book response schemas
 */
export const BookSchema = t.Object({
  books: t.Array(t.Any()), // Books structure is complex, using Any for now
});

export const LanguagesSchema = t.Array(t.Any()); // Language structure

export const ChapterSchema = t.Any(); // Chapter structure is complex

export const ExplanationSchema = t.Object({
  explanation: t.Any(), // Explanation structure
});

export const TestamentsSchema = t.Object({
  testaments: t.Any(), // Testaments structure
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
