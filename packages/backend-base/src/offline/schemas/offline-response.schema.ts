import { t } from "elysia";

// Manifest schemas
export const BibleVersionManifestSchema = t.Object({
  key: t.String(),
  name: t.String(),
  language: t.String(),
  updated_at: t.String(),
  size_bytes: t.Number(),
});

export const CommentaryLanguageManifestSchema = t.Object({
  code: t.String(),
  name: t.String(),
  updated_at: t.String(),
  size_bytes: t.Number(),
});

export const TopicLanguageManifestSchema = t.Object({
  code: t.String(),
  name: t.String(),
  updated_at: t.String(),
  size_bytes: t.Number(),
});

export const OfflineManifestSchema = t.Object({
  bible_versions: t.Array(BibleVersionManifestSchema),
  commentary_languages: t.Array(CommentaryLanguageManifestSchema),
  topic_languages: t.Array(TopicLanguageManifestSchema),
});

// Bible data schemas
export const BibleVerseDataSchema = t.Object({
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_number: t.Number(),
  text: t.String(),
});

export const BibleDataResponseSchema = t.Array(BibleVerseDataSchema);

// Commentary data schemas
export const CommentaryDataSchema = t.Object({
  explanation_id: t.Number(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_start: t.Union([t.Number(), t.Null()]),
  verse_end: t.Union([t.Number(), t.Null()]),
  type: t.String(),
  explanation: t.String(),
  language_code: t.String(),
});

export const CommentaryDataResponseSchema = t.Array(CommentaryDataSchema);

// Topics data schemas
export const TopicDataSchema = t.Object({
  topic_id: t.String(),
  name: t.String(),
  content: t.String(),
  language_code: t.String(),
});

export const TopicReferenceDataSchema = t.Object({
  topic_id: t.String(),
  book_id: t.Number(),
  chapter_number: t.Number(),
  verse_start: t.Number(),
  verse_end: t.Union([t.Number(), t.Null()]),
});

export const TopicsDataResponseSchema = t.Object({
  topics: t.Array(TopicDataSchema),
  references: t.Array(TopicReferenceDataSchema),
});
