import { Elysia, t } from "elysia";
import { createErrorHandler } from "../../common/error-handler";
import { NotFoundError } from "../../common/errors";
import { StandardErrorResponses } from "../../common/response-schemas";
import shared from "../../shared/shared.plugin";
import { BibleBrainClient } from "./bible-brain.client";
import {
  BibleBrainVersionsResponseSchema,
  ChapterAudioResponseSchema,
  ChapterTextResponseSchema,
  CopyrightResponseSchema,
  DownloadResponseSchema,
  TimestampsResponseSchema,
} from "./bible-brain.schemas";
import { BibleBrainService } from "./bible-brain.service";

/** Book ids are 3-letter USFM codes (JHN, GEN, MAT). */
const bookParam = t.Object({
  filesetId: t.String({ minLength: 4, maxLength: 32 }),
  book: t.String({ minLength: 3, maxLength: 3 }),
  chapter: t.Numeric({ minimum: 1, maximum: 150 }),
});

const plugin = new Elysia({ name: "bible-brain" })
  .use(shared)
  .onError(createErrorHandler("bible-brain plugin"))
  .state((state) => ({
    ...state,
    bibleBrainService: new BibleBrainService(
      new BibleBrainClient(),
      state.cache,
    ),
  }))
  .group("/bible/brain", (app) =>
    app
      /**
       * Versions on offer for a language. Each entry says whether it can be
       * taken offline, which is what lets the app show a download button for
       * the licensed ones and an online-only badge for the rest.
       */
      .get(
        "/versions",
        async ({ query, store: { bibleBrainService } }) => {
          const versions = await bibleBrainService.listVersions(
            query.language,
            {
              includeOffline: query.include_offline !== "false",
            },
          );
          return { versions };
        },
        {
          query: t.Object({
            // ISO-639-3, e.g. eng / deu / ron.
            language: t.String({ minLength: 2, maxLength: 3 }),
            include_offline: t.Optional(t.String()),
          }),
          response: {
            200: BibleBrainVersionsResponseSchema,
            ...StandardErrorResponses,
          },
        },
      )
      /** Freshly signed streaming URL for one chapter. */
      .get(
        "/audio/:filesetId/:book/:chapter",
        async ({ params, store: { bibleBrainService } }) => {
          const audio = await bibleBrainService.getChapterAudio(
            params.filesetId,
            params.book.toUpperCase(),
            params.chapter,
          );
          if (!audio) {
            throw new NotFoundError(
              `No audio for ${params.filesetId} ${params.book} ${params.chapter}`,
            );
          }
          return { audio };
        },
        {
          params: bookParam,
          response: {
            200: ChapterAudioResponseSchema,
            ...StandardErrorResponses,
          },
        },
      )
      /** Verse offsets that drive highlight-as-it-reads. */
      .get(
        "/timestamps/:filesetId/:book/:chapter",
        async ({ params, store: { bibleBrainService } }) => {
          const book = params.book.toUpperCase();
          const timestamps = await bibleBrainService.getVerseTimestamps(
            params.filesetId,
            book,
            params.chapter,
          );
          return {
            fileset_id: params.filesetId,
            book_id: book,
            chapter: params.chapter,
            timestamps,
          };
        },
        {
          params: bookParam,
          response: {
            200: TimestampsResponseSchema,
            ...StandardErrorResponses,
          },
        },
      )
      /** Chapter text from a text fileset. */
      .get(
        "/text/:filesetId/:book/:chapter",
        async ({ params, query, store: { bibleBrainService } }) => {
          const book = params.book.toUpperCase();
          const verses = await bibleBrainService.getChapterText(
            params.filesetId,
            book,
            params.chapter,
            { verseStart: query.verse_start, verseEnd: query.verse_end },
          );
          return {
            fileset_id: params.filesetId,
            book_id: book,
            chapter: params.chapter,
            verses,
          };
        },
        {
          params: bookParam,
          query: t.Object({
            verse_start: t.Optional(t.Numeric({ minimum: 1 })),
            verse_end: t.Optional(t.Numeric({ minimum: 1 })),
          }),
          response: {
            200: ChapterTextResponseSchema,
            ...StandardErrorResponses,
          },
        },
      )
      /** Copyright text the UI must display (licence term 3). */
      .get(
        "/copyright/:bibleId",
        async ({ params, store: { bibleBrainService } }) => {
          const filesets = await bibleBrainService.getCopyright(params.bibleId);
          return { bible_id: params.bibleId, filesets };
        },
        {
          params: t.Object({
            bibleId: t.String({ minLength: 4, maxLength: 32 }),
          }),
          response: {
            200: CopyrightResponseSchema,
            ...StandardErrorResponses,
          },
        },
      )
      /**
       * Licence-sanctioned download URL for offline storage. 404 when the
       * fileset is stream-only for our key — the app should surface that as
       * "streaming only", not as a failure.
       */
      .get(
        "/download/:filesetId/:book/:chapter",
        async ({ params, store: { bibleBrainService } }) => {
          const book = params.book.toUpperCase();
          const result = await bibleBrainService.getDownloadable(
            params.filesetId,
            book,
            params.chapter,
          );
          if (!result) {
            throw new NotFoundError(
              `${params.filesetId} is not licensed for offline download`,
            );
          }
          return {
            fileset_id: params.filesetId,
            book_id: book,
            chapter: params.chapter,
            ...result,
          };
        },
        {
          params: bookParam,
          response: {
            200: DownloadResponseSchema,
            ...StandardErrorResponses,
          },
        },
      ),
  );

export default plugin;
export type BibleBrainPlugin = typeof plugin;
