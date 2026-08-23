import { t } from "elysia";

const FilesetSchema = t.Object({
  id: t.String(),
  type: t.String(),
  size: t.String(),
  offline_capable: t.Boolean(),
});

/**
 * A version the app can offer. `offline_capable` is what the download UI keys
 * off: true means Bible Brain licenses us to persist the audio, false means it
 * is stream-only and needs a live connection.
 */
export const BibleBrainVersionSchema = t.Object({
  abbr: t.String(),
  name: t.String(),
  language: t.String(),
  iso: t.String(),
  text_filesets: t.Array(FilesetSchema),
  audio_filesets: t.Array(FilesetSchema),
  has_verse_timing: t.Boolean(),
  offline_capable: t.Boolean(),
});

export const BibleBrainVersionsResponseSchema = t.Object({
  versions: t.Array(BibleBrainVersionSchema),
});

export const ChapterAudioSchema = t.Object({
  fileset_id: t.String(),
  book_id: t.String(),
  chapter: t.Number(),
  url: t.String(),
  duration_seconds: t.Union([t.Number(), t.Null()]),
  filesize_bytes: t.Union([t.Number(), t.Null()]),
  offline_capable: t.Boolean(),
  /** Seconds until the signed URL stops working; clients should re-fetch. */
  expires_in_seconds: t.Union([t.Number(), t.Null()]),
});

export const ChapterAudioResponseSchema = t.Object({
  audio: ChapterAudioSchema,
});

export const TimestampsResponseSchema = t.Object({
  fileset_id: t.String(),
  book_id: t.String(),
  chapter: t.Number(),
  timestamps: t.Array(t.Object({ verse: t.Number(), seconds: t.Number() })),
});

export const ChapterTextResponseSchema = t.Object({
  fileset_id: t.String(),
  book_id: t.String(),
  chapter: t.Number(),
  verses: t.Array(t.Object({ verse: t.Number(), text: t.String() })),
});

export const CopyrightResponseSchema = t.Object({
  bible_id: t.String(),
  filesets: t.Array(
    t.Object({
      fileset_id: t.String(),
      type: t.String(),
      copyright: t.Union([t.String(), t.Null()]),
    }),
  ),
});

export const DownloadResponseSchema = t.Object({
  fileset_id: t.String(),
  book_id: t.String(),
  chapter: t.Number(),
  url: t.String(),
  filesize_bytes: t.Union([t.Number(), t.Null()]),
  duration_seconds: t.Union([t.Number(), t.Null()]),
});
