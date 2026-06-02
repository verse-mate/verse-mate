import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import HighlightColorEnum from "database/src/models/public/HighlightColorEnum";
import { Elysia, t } from "elysia";
import { authDerive } from "../auth/auth.utils";
import { createErrorHandler } from "../common/error-handler";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../common/errors";
import { StandardErrorResponses } from "../common/response-schemas";
import { type AiProvider, getAiProvider } from "../shared/ai";
import shared from "../shared/shared.plugin";
import { parseBibleData } from "./bible";
import { RatingDto } from "./dto/book/rating.dto";
import { BibleRepository } from "./repository/bible.repository";
import { PromptRepository } from "./repository/prompt.repository";
import {
  BibleVersionsSchema,
  BookSchema,
  BookmarkActionSchema,
  BookmarksSchema,
  ChapterIdSchema,
  ChapterSchema,
  ExplanationSchema,
  HighlightAddSchema,
  HighlightDeleteSchema,
  HighlightUpdateSchema,
  HighlightsSchema,
  LanguagesSchema,
  LastChapterReadSaveSchema,
  LastChapterReadSchema,
  NoteAddSchema,
  NoteDeleteSchema,
  type NoteFromDatabase,
  NoteUpdateSchema,
  NotesSchema,
  RatingSaveSchema,
  RatingsSchema,
  StudyLabelsSchema,
  StudySchema,
  TestamentsSchema,
} from "./schemas/bible-response.schema";
import { AutoHighlightService } from "./services/auto-highlight.service";
import { BibleService } from "./services/bible.service";
import { PromptService } from "./services/prompt.service";

const model = "gpt-5-nano";

// Lazy AiProvider singleton — module-level use means we can't construct in
// the constructor body; eager init would fail in test envs without OPEN_AI_KEY.
let _ai: AiProvider | null = null;
function ai(): AiProvider {
  if (!_ai) _ai = getAiProvider();
  return _ai;
}

async function gpt5Text({
  system,
  user,
}: {
  system?: string;
  user: string;
}) {
  const response = await ai().responsesCreate({
    model,
    reasoningEffort: "medium",
    instructions: system,
    input: user,
    maxOutputTokens: 20000,
  });

  return response.outputText || "oopsies";
}

/**
 * Validates that a bookId is within the valid range (1-66) for Bible books
 * @throws {ValidationError} if bookId is out of range
 */
function validateBookId(bookId: number): void {
  if (bookId < 1 || bookId > 66) {
    throw new ValidationError("Invalid book ID. Must be between 1 and 66.");
  }
}

/**
 * Parse an opt-in boolean query flag. Permissive on the truthy side ("1",
 * "true", "yes" — case-insensitive) and silent on everything else, so the
 * back-compat contract holds: an unrecognized value is treated as omitted
 * rather than 400'd.
 */
function isTruthyQueryFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const plugin = new Elysia()
  .use(shared)
  .onError(createErrorHandler("bible plugin"))
  .state((state) => {
    const bibleRepository = new BibleRepository(state.db);
    return {
      ...state,
      bibleService: new BibleService(state.db, bibleRepository),
      promptService: new PromptService(
        new BibleService(state.db, bibleRepository),
        new PromptRepository(state.db),
      ),
      autoHighlightService: new AutoHighlightService(state.db, bibleRepository),
    };
  })
  .group("/bible", (app) =>
    app
      .get(
        "/books",
        async () => {
          const metadataFile = Bun.file(
            `${import.meta.dir}/data/key_english.json`,
          );
          const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);
          const bible = await parseBibleData(bibleFile, metadataFile);

          return { books: bible.books };
        },
        {
          response: {
            200: BookSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/languages",
        async ({ store: { bibleService } }) => {
          return await bibleService.getAvailableExplanationLanguages();
        },
        {
          response: {
            200: LanguagesSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/versions",
        async ({ store: { bibleService } }) => {
          return await bibleService.getBibleVersions();
        },
        {
          response: {
            200: BibleVersionsSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/book/:bookId/:chapterNumber",
        async ({ params, store: { bibleService, db }, query }) => {
          const { bookId, chapterNumber } = params;
          // `bible_version` is preferred (consistent with /topics); `versionKey`
          // is kept as a back-compat alias. Defaults to NASB1995.
          const versionKey =
            query.bible_version ?? query.versionKey ?? "NASB1995";

          // Strong's-tagged rendering is opt-in. Truthy values ("1" / "true" /
          // "yes") flip per-verse output to {verseNumber, tokens} for rows
          // that have been seeded via ingest-strongs-tokens. Untagged rows
          // (and the entire NASB1995 / KJV path) still serve the legacy
          // {verseNumber, text} shape — back-compat is silent.
          const tagged = isTruthyQueryFlag(query.tagged);

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            throw new NotFoundError("Invalid bible version");
          }

          const result = await bibleService.getBook({
            book_id: bookId,
            chapter_number: chapterNumber,
            version_id: version.id,
            tagged,
          });

          return result;
        },
        {
          params: t.Object({
            bookId: t.Numeric(),
            chapterNumber: t.Numeric(),
          }),
          query: t.Object({
            bible_version: t.Optional(t.String()),
            versionKey: t.Optional(t.String()),
            /**
             * Opt-in flag for Strong's-tagged verse rendering. Accepts
             * "1", "true", or "yes" (case-insensitive). Anything else
             * (or omitted) returns the legacy `{verseNumber, text}` shape.
             */
            tagged: t.Optional(t.String()),
          }),
          response: {
            200: ChapterSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .resolve({ as: "scoped" }, authDerive)
      .get(
        "/book/:bookId/introduction",
        async ({ params, query, store: { bibleService }, currentUserId }) => {
          const { bookId } = params;
          const { languageCode = "en" } = query;

          validateBookId(bookId);

          // Validate language code format (2-letter ISO code)
          if (languageCode && !/^[a-z]{2}(-[A-Z]{2})?$/.test(languageCode)) {
            throw new ValidationError(
              "Invalid language code format. Expected format: 'en' or 'en-US'.",
            );
          }

          const introduction = await bibleService.getBookIntroduction(
            bookId,
            languageCode,
          );

          let hasViewed = false;
          if (currentUserId && introduction) {
            const viewedRecord = await bibleService.getUserViewedIntroduction(
              currentUserId,
              bookId,
            );
            hasViewed = !!viewedRecord;
          }

          return { introduction, hasViewed };
        },
        {
          params: t.Object({
            bookId: t.Numeric(),
          }),
          query: t.Object({
            languageCode: t.Optional(t.String()),
          }),
          response: {
            200: t.Object({
              introduction: t.Any(),
              hasViewed: t.Boolean(),
            }),
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/:bookId/introduction/mark-viewed",
        async ({ params, store: { bibleService }, currentUserId }) => {
          if (!currentUserId) {
            throw new UnauthorizedError(
              "Must be logged in to mark introduction as viewed",
            );
          }

          const { bookId } = params;

          validateBookId(bookId);

          await bibleService.markIntroductionAsViewed(currentUserId, bookId);

          return { success: true };
        },
        {
          params: t.Object({
            bookId: t.Numeric(),
          }),
          response: {
            200: t.Object({ success: t.Boolean() }),
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/book/explanation/:bookId/:chapterNumber",
        async ({
          params,
          store: { bibleService, promptService: _promptService, db },
          query,
          currentUserId,
        }) => {
          const { bookId, chapterNumber } = params;
          const { explanationType, lang } = query;
          const versionKey =
            query.bible_version ?? query.versionKey ?? "NASB1995";

          const version = await db
            .getOrCreateConnection()
            .selectFrom("bible_versions")
            .select(["id", "language_code"])
            .where("version_key", "=", versionKey)
            .executeTakeFirst();

          if (!version) {
            throw new NotFoundError("Invalid bible version");
          }

          const explanation = await bibleService.getExplanation({
            book_id: bookId,
            chapter_number: chapterNumber,
            version_id: version.id,
            type: explanationType as ExplanationTypeEnum | undefined,
            user_id: currentUserId || undefined,
            lang,
          });

          return { explanation };
        },
        {
          params: t.Object({
            bookId: t.Numeric(),
            chapterNumber: t.Numeric(),
          }),
          query: t.Object({
            bible_version: t.Optional(t.String()),
            versionKey: t.Optional(t.String()),
            explanationType: t.Optional(t.String()),
            lang: t.Optional(
              t.String({
                description:
                  "BCP-47 language code (e.g. 'es', 'pt-BR') for the AI commentary. Selects the active explanation in that language, falling back to English when no translation exists. Takes precedence over the bible version's language and the signed-in user's preferred_language.",
              }),
            ),
          }),
          response: {
            200: ExplanationSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/testaments",
        async ({ store: { bibleService }, query }) => {
          // `bible_version` is the canonical query param across the Bible
          // routes; `versionKey` is kept as the back-compat alias used by
          // the generated mobile SDK. Unknown keys fall back to default
          // English names in the service layer.
          const versionKey = query.bible_version ?? query.versionKey;
          const { testaments } = await bibleService.getTestaments({
            versionKey,
          });
          return { testaments: testaments.keys };
        },
        {
          query: t.Object({
            bible_version: t.Optional(t.String()),
            versionKey: t.Optional(t.String()),
          }),
          response: {
            200: TestamentsSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/chapter-id/:bookId/:chapterNumber",
        async ({ params, store: { db } }) => {
          const { bookId, chapterNumber } = params;

          // Create repository instance to get chapter ID
          const bibleRepository = new BibleRepository(db);

          const { chapter_id } = await bibleRepository.getChapterId({
            book_id: bookId,
            chapter_number: chapterNumber,
          });

          if (chapter_id == null) {
            throw new NotFoundError("Chapter not found");
          }

          return { chapter_id };
        },
        {
          params: t.Object({
            bookId: t.Numeric(),
            chapterNumber: t.Numeric(),
          }),
          response: {
            200: ChapterIdSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/study/:bookId/:chapterNumber",
        async ({ params, store: { bibleService }, query }) => {
          const { bookId, chapterNumber } = params;
          const study = await bibleService.getStudy({
            book_id: bookId,
            chapter: chapterNumber,
            lang: query.lang,
          });
          return { study };
        },
        {
          params: t.Object({
            bookId: t.Numeric(),
            chapterNumber: t.Numeric(),
          }),
          query: t.Object({
            lang: t.Optional(
              t.String({
                description:
                  "BCP-47 language code (e.g. 'es-MX', 'ro-RO') for the inductive study. Selects the active translation in that language, falling back to the English baseline when no translation exists.",
              }),
            ),
          }),
          response: {
            200: StudySchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/study-labels",
        async ({ store: { bibleService }, query }) => {
          const result = await bibleService.getStudyLabels({
            lang: query.lang,
          });
          return {
            language_code: result?.language_code ?? null,
            labels:
              (result?.labels as Record<string, string> | undefined) ?? null,
          };
        },
        {
          query: t.Object({
            lang: t.Optional(
              t.String({
                description:
                  "BCP-47 language code (e.g. 'pt-BR', 'ro-RO') for the inductive-study UI chrome labels. Family-matched; returns null for English/unknown languages so the client uses its bundled getStudyLabels fallback.",
              }),
            ),
          }),
          response: {
            200: StudyLabelsSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/explanation/save-rating",
        async ({ body, store: { bibleService } }) => {
          const saveRating = await bibleService.saveRating({
            user: body.user,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            explanation_id: body.explanation_id,
            rating: body.rating,
          });
          return { result: saveRating };
        },
        {
          body: RatingDto,
          response: {
            200: RatingSaveSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/book/explanation/update-rating",
        async ({ body, store: { bibleService } }) => {
          const { user, book_id, chapter_number, explanation_id, rating } =
            body;
          const updateRating = await bibleService.updatedUserRating({
            user,
            book_id,
            chapter_number,
            explanation_id,
            rating,
          });
          return { result: updateRating };
        },
        {
          body: RatingDto,
          response: {
            200: RatingSaveSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/explanation/ratings",
        async ({ body, store: { bibleService } }) => {
          const { book_id, chapter_number, user, explanation_id } = body;

          const { userRating } = await bibleService.ratingByUser({
            book_id,
            chapter_number,
            user,
            explanation_id,
          });
          const totalUsersWhoRated = await bibleService.totalUsersWhoRated({
            book_id,
            chapter_number,
            explanation_id,
          });
          const averageRating = await bibleService.averageRating({
            book_id,
            chapter_number,
            explanation_id,
          });

          return {
            userRating: userRating.stars,
            totalUsersWhoRated: totalUsersWhoRated.total_users,
            averageRating: averageRating.averageRating,
          };
        },
        {
          body: t.Omit(RatingDto, ["rating"]),
          response: {
            200: RatingsSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/chapter/save-last-read",
        async ({ body, store: { bibleService } }) => {
          const saveLastChapterRead = await bibleService.saveLastChapterRead({
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            id: body.user_id,
          });

          return { result: saveLastChapterRead };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
          }),
          response: {
            200: LastChapterReadSaveSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/chapter/last-read",
        async ({ body, store: { bibleService } }) => {
          const lastChapterReadByUser =
            await bibleService.lastChapterReadByUser({
              id: body.user_id,
            });
          return { result: lastChapterReadByUser };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
          }),
          response: {
            200: LastChapterReadSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/book/bookmarks/:user_id",
        async ({ params, store: { bibleService } }) => {
          console.log("=== GET /book/bookmarks/:user_id ENDPOINT ===");
          console.log("Request params:", params);
          console.log("Environment:", {
            NODE_ENV: process.env.NODE_ENV,
            API_URL: process.env.API_URL,
            POSTGRES_URL: process.env.POSTGRES_URL
              ? "Set (value hidden)"
              : "Not set",
          });

          console.log("Attempting to get bookmarks for user:", params.user_id);
          const { favorites } = await bibleService.getBookmarks({
            id: params.user_id,
          });

          console.log(
            "Successfully retrieved bookmarks, count:",
            favorites.length,
          );
          return { favorites };
        },
        {
          params: t.Object({ user_id: t.String({ format: "uuid" }) }),
          response: {
            200: BookmarksSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/book/notes/:user_id",
        async ({ params, store: { bibleService } }) => {
          console.log("=== GET /book/notes/:user_id ENDPOINT ===");
          console.log("Request params:", params);

          console.log("Attempting to get notes for user:", params.user_id);
          const { notes } = await bibleService.getNotes({
            id: params.user_id,
          });
          const serializedNotes = notes.map((n: NoteFromDatabase) => ({
            ...n,
            created_at:
              n.created_at instanceof Date
                ? n.created_at.toISOString()
                : n.created_at || new Date().toISOString(),
            updated_at:
              n.updated_at instanceof Date
                ? n.updated_at.toISOString()
                : n.updated_at || new Date().toISOString(),
          }));

          return { notes: serializedNotes };
        },
        {
          params: t.Object({ user_id: t.String({ format: "uuid" }) }),
          response: {
            200: NotesSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/note/add",
        async ({ body, store: { bibleService } }) => {
          console.log("Adding note:", body);

          const content =
            typeof body.content === "string" ? body.content.trim() : "";
          if (
            !body.user_id ||
            !body.book_id ||
            !body.chapter_number ||
            !content
          ) {
            console.error("Missing required fields for adding note");
            throw new ValidationError("Missing required fields");
          }

          // Normalize verse_id: keep a number or leave undefined; repo converts to null
          const verse_id =
            typeof body.verse_id === "number" ? body.verse_id : undefined;

          const { note } = await bibleService.addNote({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            verse_id,
            content,
          });

          // Serialize Date fields to ISO strings
          const serializedNote = {
            ...note,
            created_at:
              note.created_at instanceof Date
                ? note.created_at.toISOString()
                : note.created_at || new Date().toISOString(),
            updated_at:
              note.updated_at instanceof Date
                ? note.updated_at.toISOString()
                : note.updated_at || new Date().toISOString(),
          };

          return { success: true, note: serializedNote };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
            verse_id: t.Optional(t.Number()),
            content: t.String(),
          }),
          response: {
            200: NoteAddSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/book/note/update",
        async ({ body, store: { bibleService } }) => {
          console.log("Updating note:", body);

          if (!body.note_id || !body.content) {
            console.error("Missing required fields for updating note");
            throw new ValidationError("Missing required fields");
          }

          const { success } = await bibleService.updateNote(
            body.note_id,
            body.content,
          );

          return { success };
        },
        {
          body: t.Object({
            note_id: t.String({ format: "uuid" }),
            content: t.String(),
          }),
          response: {
            200: NoteUpdateSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/book/note/remove",
        async ({ query, store: { bibleService } }) => {
          console.log("Removing note - query params:", query);

          if (!query.note_id) {
            console.error("Missing note_id for removing note");
            throw new ValidationError("Missing note_id");
          }

          const { success } = await bibleService.deleteNote(query.note_id);

          return { success };
        },
        {
          query: t.Object({
            note_id: t.String({ format: "uuid" }),
          }),
          response: {
            200: NoteDeleteSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/bookmark/add",
        async ({ body, store: { bibleService } }) => {
          console.log("Adding bookmark:", body);

          if (
            !body.user_id ||
            !body.book_id ||
            body.chapter_number === undefined
          ) {
            console.error("Missing required fields for adding bookmark");
            throw new ValidationError("Missing required fields");
          }

          const { success } = await bibleService.addBookmark({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            insight_type: body.insight_type,
          });

          return { success };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
            insight_type: t.Optional(t.String()),
          }),
          response: {
            200: BookmarkActionSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/book/bookmark/remove",
        async ({ query, store: { bibleService } }) => {
          console.log("Removing bookmark - query params:", query);

          const user_id = query.user_id;
          const book_id = Number(query.book_id);
          const chapter_number = Number(query.chapter_number);
          const insight_type = query.insight_type;

          if (
            !user_id ||
            Number.isNaN(book_id) ||
            Number.isNaN(chapter_number)
          ) {
            console.error(
              "Missing or invalid required fields for removing bookmark",
            );
            throw new ValidationError("Missing or invalid required fields");
          }

          const { success } = await bibleService.removeBookmark({
            user_id,
            book_id,
            chapter_number,
            insight_type,
          });

          return { success };
        },
        {
          query: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.String(),
            chapter_number: t.String(),
            insight_type: t.Optional(t.String()),
          }),
          response: {
            200: BookmarkActionSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/book/bookmark/remove",
        async ({ body, request, store: { bibleService } }) => {
          console.log("POST method for removing bookmark:", body);
          console.log("Headers:", request.headers);

          // Check if this is meant to be a DELETE request
          const methodOverride = request.headers.get("x-http-method-override");
          if (methodOverride && methodOverride.toLowerCase() !== "delete") {
            console.warn(`Unexpected method override: ${methodOverride}`);
          }

          if (
            !body.user_id ||
            !body.book_id ||
            body.chapter_number === undefined
          ) {
            console.error("Missing required fields for removing bookmark");
            throw new ValidationError("Missing required fields");
          }

          const { success } = await bibleService.removeBookmark({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            insight_type: body.insight_type,
          });

          return { success };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
            insight_type: t.Optional(t.String()),
          }),
          response: {
            200: BookmarkActionSchema,
            ...StandardErrorResponses,
          },
        },
      )
      // Highlight endpoints
      .get(
        "/highlights/:user_id",
        async ({ params, store: { bibleService } }) => {
          console.log("=== GET /highlights/:user_id ENDPOINT ===");
          console.log("Getting all highlights for user:", params.user_id);

          const { highlights } = await bibleService.getUserHighlights({
            user_id: params.user_id,
          });

          console.log(
            "Successfully retrieved highlights, count:",
            highlights.length,
          );

          // Serialize Date fields to ISO strings with fallback for null
          const serializedHighlights = highlights.map((h) => ({
            ...h,
            created_at:
              h.created_at instanceof Date
                ? h.created_at.toISOString()
                : h.created_at || new Date().toISOString(),
            updated_at:
              h.updated_at instanceof Date
                ? h.updated_at.toISOString()
                : h.updated_at || new Date().toISOString(),
          }));

          return { highlights: serializedHighlights };
        },
        {
          params: t.Object({
            user_id: t.String({ format: "uuid" }),
          }),
          response: {
            200: HighlightsSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .get(
        "/highlights/:user_id/:book_id/:chapter_number",
        async ({ params, store: { bibleService } }) => {
          console.log(
            "=== GET /highlights/:user_id/:book_id/:chapter_number ENDPOINT ===",
          );
          console.log(
            "Getting chapter highlights for user:",
            params.user_id,
            "book:",
            params.book_id,
            "chapter:",
            params.chapter_number,
          );

          const { highlights } = await bibleService.getChapterHighlights({
            user_id: params.user_id,
            book_id: params.book_id,
            chapter_number: params.chapter_number,
          });

          console.log(
            "Successfully retrieved chapter highlights, count:",
            highlights.length,
          );

          // Serialize Date fields to ISO strings with fallback for null
          const serializedHighlights = highlights.map((h) => ({
            ...h,
            created_at:
              h.created_at instanceof Date
                ? h.created_at.toISOString()
                : h.created_at || new Date().toISOString(),
            updated_at:
              h.updated_at instanceof Date
                ? h.updated_at.toISOString()
                : h.updated_at || new Date().toISOString(),
          }));

          return { highlights: serializedHighlights };
        },
        {
          params: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Numeric(),
            chapter_number: t.Numeric(),
          }),
          response: {
            200: HighlightsSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .post(
        "/highlight/add",
        async ({ body, store: { bibleService } }) => {
          console.log("Adding highlight:", body);

          if (
            !body.user_id ||
            !body.book_id ||
            !body.chapter_number ||
            !body.start_verse ||
            !body.end_verse
          ) {
            console.error("Missing required fields for adding highlight");
            throw new ValidationError("Missing required fields");
          }

          const result = await bibleService.createHighlight({
            user_id: body.user_id,
            book_id: body.book_id,
            chapter_number: body.chapter_number,
            start_verse: body.start_verse,
            end_verse: body.end_verse,
            color: body.color,
            start_char: body.start_char,
            end_char: body.end_char,
            selected_text: body.selected_text,
          });

          // Serialize dates if successful
          if (result.success && result.highlight) {
            return {
              success: true as const,
              highlight: {
                ...result.highlight,
                created_at:
                  result.highlight.created_at instanceof Date
                    ? result.highlight.created_at.toISOString()
                    : result.highlight.created_at || new Date().toISOString(),
                updated_at:
                  result.highlight.updated_at instanceof Date
                    ? result.highlight.updated_at.toISOString()
                    : result.highlight.updated_at || new Date().toISOString(),
              },
            };
          }

          // Return error response with proper literal type
          return {
            success: false as const,
            error: result.error || "Failed to create highlight",
            overlaps: result.overlaps,
          };
        },
        {
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            book_id: t.Number(),
            chapter_number: t.Number(),
            start_verse: t.Number(),
            end_verse: t.Number(),
            color: t.Optional(t.Enum(HighlightColorEnum)),
            start_char: t.Optional(t.Number()),
            end_char: t.Optional(t.Number()),
            selected_text: t.Optional(t.String()),
          }),
          response: {
            200: HighlightAddSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .put(
        "/highlight/:highlight_id",
        async ({ params, body, store: { bibleService } }) => {
          console.log(
            "Updating highlight:",
            params.highlight_id,
            "with color:",
            body.color,
          );

          const { highlight, success } =
            await bibleService.updateHighlightColor({
              highlight_id: params.highlight_id,
              user_id: body.user_id,
              color: body.color,
            });

          // Serialize dates if highlight exists
          if (highlight) {
            return {
              success,
              highlight: {
                ...highlight,
                created_at:
                  highlight.created_at instanceof Date
                    ? highlight.created_at.toISOString()
                    : highlight.created_at || new Date().toISOString(),
                updated_at:
                  highlight.updated_at instanceof Date
                    ? highlight.updated_at.toISOString()
                    : highlight.updated_at || new Date().toISOString(),
              },
            };
          }

          return { success, highlight: null };
        },
        {
          params: t.Object({
            highlight_id: t.Number(),
          }),
          body: t.Object({
            user_id: t.String({ format: "uuid" }),
            color: t.Enum(HighlightColorEnum),
          }),
          response: {
            200: HighlightUpdateSchema,
            ...StandardErrorResponses,
          },
        },
      )
      .delete(
        "/highlight/:highlight_id",
        async ({ params, currentUserId, store: { bibleService } }) => {
          console.log("Deleting highlight:", params.highlight_id);

          if (!currentUserId) {
            throw new UnauthorizedError("Authentication required");
          }

          const { success } = await bibleService.deleteHighlight({
            highlight_id: params.highlight_id,
            user_id: currentUserId,
          });

          return { success };
        },
        {
          params: t.Object({
            highlight_id: t.Number(),
          }),
          response: {
            200: HighlightDeleteSchema,
            ...StandardErrorResponses,
          },
        },
      )
      // Auto-highlights endpoints
      .get(
        "/auto-highlights/:book_id/:chapter_number",
        async ({ params, query, store: { autoHighlightService } }) => {
          const bookId = Number.parseInt(params.book_id, 10);
          const chapterNumber = Number.parseInt(params.chapter_number, 10);

          // Parse theme_ids if provided (comma-separated)
          const themeIds = query.themes
            ? query.themes
                .split(",")
                .map((id) => Number.parseInt(id.trim(), 10))
            : undefined;

          // Parse relevance parameters
          // Format: "theme_id:relevance,theme_id:relevance" e.g., "1:2,3:4"
          let themeRelevanceMap: Map<number, number> | undefined;
          if (query.theme_relevance) {
            themeRelevanceMap = new Map();
            const pairs = query.theme_relevance.split(",");
            for (const pair of pairs) {
              const [themeIdStr, relevanceStr] = pair.split(":");
              if (themeIdStr && relevanceStr) {
                themeRelevanceMap.set(
                  Number.parseInt(themeIdStr.trim(), 10),
                  Number.parseInt(relevanceStr.trim(), 10),
                );
              }
            }
          }

          // Global relevance fallback
          let defaultRelevance: number | undefined;
          if (query.min_relevance) {
            defaultRelevance = Number.parseInt(query.min_relevance, 10);
          } else {
            defaultRelevance =
              await autoHighlightService.getGlobalDefaultRelevance();
          }

          const highlights = await autoHighlightService.getHighlightsByChapter({
            book_id: bookId,
            chapter_number: chapterNumber,
            theme_ids: themeIds,
            theme_relevance_map: themeRelevanceMap,
            default_relevance: defaultRelevance,
          });

          return { success: true, data: highlights };
        },
        {
          params: t.Object({
            book_id: t.String(),
            chapter_number: t.String(),
          }),
          query: t.Object({
            themes: t.Optional(t.String()),
            theme_relevance: t.Optional(t.String()),
            min_relevance: t.Optional(t.String()),
          }),
        },
      )
      .get("/highlight-themes", async ({ store: { autoHighlightService } }) => {
        const themes = await autoHighlightService.getActiveThemes();
        return { success: true, data: themes };
      })
      .get(
        "/user/theme-preferences",
        async ({ currentUserId, store: { autoHighlightService } }) => {
          if (!currentUserId) {
            throw new UnauthorizedError("Authentication required");
          }

          const preferences =
            await autoHighlightService.getUserThemePreferences(currentUserId);
          return { success: true, data: preferences };
        },
      )
      .patch(
        "/user/theme-preferences/:theme_id",
        async ({
          params,
          body,
          currentUserId,
          store: { autoHighlightService },
        }) => {
          if (!currentUserId) {
            throw new UnauthorizedError("Authentication required");
          }

          const themeId = Number.parseInt(params.theme_id, 10);

          await autoHighlightService.updateUserThemePreference({
            user_id: currentUserId,
            theme_id: themeId,
            ...body,
          });

          return { success: true };
        },
        {
          params: t.Object({
            theme_id: t.String(),
          }),
          body: t.Object({
            is_enabled: t.Optional(t.Boolean()),
            custom_color: t.Optional(t.String()),
            relevance_threshold: t.Optional(t.Number()),
            admin_override: t.Optional(t.Boolean()),
          }),
        },
      ),
  );

export type BiblePlugin = typeof plugin;

export default plugin;
