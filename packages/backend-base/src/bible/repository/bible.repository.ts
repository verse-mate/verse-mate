import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import FavoriteTypeEnum from "database/src/models/public/FavoriteTypeEnum";
import type HighlightColorEnum from "database/src/models/public/HighlightColorEnum";
import type {
  NewVerseHighlights,
  VerseHighlights,
} from "database/src/models/public/VerseHighlights";
import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";
import type { BookDto } from "../dto/book/book.dto";
import type { ChapterDto } from "../dto/book/chapter.dto";
import type { LastChapterReadDto } from "../dto/book/last-chapter-read.dto";
import type { RatingDto } from "../dto/book/rating.dto";
import type { CreateHighlightDto } from "../dto/highlight/create-highlight.dto";
import type { DeleteHighlightDto } from "../dto/highlight/delete-highlight.dto";
import type { UpdateHighlightDto } from "../dto/highlight/update-highlight.dto";
import type { UserChapterDto } from "../dto/highlight/user-chapter.dto";
import type { UserDto } from "../dto/user/user.dto";
import { currentDate } from "../utils/custom-date";

export class BibleRepository {
  constructor(private readonly db: db) {}

  /**
   * Testaments and their books, chapters, verses and explanations
   */
  async getTestaments() {
    const testaments = await this.db
      .getOrCreateConnection()
      .selectFrom("books")
      .leftJoin("chapters", "chapters.book_id", "books.book_id")
      .select([
        "books.book_id",
        "books.name",
        "books.testament",
        "books.genre_id",
      ])
      .select((eb) => eb.fn.count("chapters.chapter_id").as("total_chapters"))
      .groupBy("books.book_id")
      .orderBy("books.book_id")
      .execute();

    return { testaments: testaments ?? null };
  }

  async getBook({ book_id }: Pick<BookDto, "book_id">) {
    const book = await this.db
      .getOrCreateConnection()
      .selectFrom("books")
      .leftJoin("genres", "genres.genre_id", "books.genre_id")
      .where("book_id", "=", book_id)
      .select([
        "books.book_id",
        "books.name",
        "books.testament",
        "genres.genre_id",
        "genres.name as genre_name",
      ])
      .executeTakeFirst();

    return {
      book: book ?? null,
    };
  }

  async getChapter({
    book_id,
    chapter_number,
  }: Pick<ChapterDto, "book_id" | "chapter_number">) {
    const chapter = await this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .select(["chapter_id", "chapter_number"])
      .where((eb) =>
        eb.and([
          eb("book_id", "=", book_id),
          eb("chapter_number", "=", chapter_number),
        ]),
      )
      .executeTakeFirst();

    return { chapter: chapter ?? null };
  }

  async getSubtitles({ chapter_id }: Pick<ChapterDto, "chapter_id">) {
    const subtitles = await this.db
      .getOrCreateConnection()
      .selectFrom("subtitles")
      .where("chapter_id", "=", chapter_id)
      .select(["subtitle", "start_verse", "end_verse"])
      .orderBy("start_verse", "asc")
      .execute();

    return { subtitles: subtitles ?? null };
  }

  async getVerses({
    chapter_id,
    version_id,
  }: Pick<ChapterDto, "chapter_id"> & {
    version_id: string;
  }) {
    const verses = await this.db
      .getOrCreateConnection()
      .selectFrom("verses")
      .where("chapter_id", "=", chapter_id)
      .where("version_id", "=", version_id)
      .select(["verses.verse_number as verseNumber", "verses.text"])
      .orderBy("verseNumber", "asc")
      .execute();

    return { verses: verses ?? null };
  }

  async getSpecificVersesByBookNameAndChapter(
    bookName: string,
    chapterNumber: number,
    versionKey: string,
    verseNumbers: number[],
  ) {
    const version = await this.db
      .getOrCreateConnection()
      .selectFrom("bible_versions")
      .where("version_key", "=", versionKey)
      .select("id")
      .executeTakeFirst();

    if (!version) {
      return [];
    }

    const verses = await this.db
      .getOrCreateConnection()
      .selectFrom("verses")
      .innerJoin("chapters", "verses.chapter_id", "chapters.chapter_id")
      .innerJoin("books", "chapters.book_id", "books.book_id")
      .where("books.name", "=", bookName)
      .where("chapters.chapter_number", "=", chapterNumber)
      .where("verses.version_id", "=", version.id)
      .where("verses.verse_number", "in", verseNumbers)
      .select(["verses.text", "verses.verse_number as verseNumber"])
      .execute();

    return verses;
  }

  async saveExplanation({
    type,
    explanation,
    chapter_id,
    language_code,
  }: {
    type: ExplanationTypeEnum;
    explanation: string;
    chapter_id: number;
    language_code: string;
  }) {
    await this.db
      .getOrCreateConnection()
      .insertInto("explanations")
      .values({
        type,
        explanation,
        chapter_id,
        language_code,
        version: 1,
        is_active: true,
      })
      .onConflict((oc) =>
        oc
          .columns(["chapter_id", "type", "language_code", "version"])
          .doUpdateSet({ explanation, is_active: true }),
      )
      .execute();

    return { success: true };
  }

  async getChapterId({
    book_id,
    chapter_number,
  }: Pick<ChapterDto, "book_id" | "chapter_number">) {
    try {
      console.log(
        "Repository: Getting chapter_id for book_id:",
        book_id,
        "chapter_number:",
        chapter_number,
      );

      // Log connection attempt
      console.log(
        "Repository: Attempting database connection for getChapterId",
      );
      const connection = this.db.getOrCreateConnection();
      console.log(
        "Repository: Connection established successfully for getChapterId",
      );

      // Log SQL query details
      console.log("Repository: Executing getChapterId query");
      const chapter = await connection
        .selectFrom("chapters")
        .where("book_id", "=", book_id)
        .where("chapter_number", "=", chapter_number)
        .select("chapter_id")
        .executeTakeFirst();

      console.log("Repository: getChapterId result:", chapter);

      if (!chapter?.chapter_id) {
        console.log(
          "Repository: No chapter_id found for book_id:",
          book_id,
          "chapter_number:",
          chapter_number,
        );
      }

      return { chapter_id: chapter?.chapter_id ?? null };
    } catch (error) {
      console.error("Repository: Error getting chapter_id:", error);
      if (error instanceof Error) {
        console.error("Repository: Error details:", error.message);
        console.error("Repository: Error stack:", error.stack);
      }
      return { chapter_id: null };
    }
  }

  async getExplanation({
    book_id,
    chapter_number,
    language_code,
  }: Pick<ChapterDto, "book_id" | "chapter_number"> & {
    language_code: string;
  }) {
    const base_language_code = language_code.split("-")[0];

    const explanation = await this.db
      .getOrCreateConnection()
      .selectFrom("explanations")
      .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
      .innerJoin(
        "explanation_languages",
        "explanation_languages.language_code",
        "explanations.language_code",
      )
      .select([
        "chapters.book_id",
        "chapters.chapter_number",
        "explanations.type",
        "explanations.explanation",
        "explanations.explanation_id",
      ])
      .where((eb) =>
        eb.and([
          eb("chapters.book_id", "=", book_id),
          eb("chapters.chapter_number", "=", chapter_number),
          eb.or([
            eb("explanations.language_code", "in", [
              language_code,
              base_language_code,
            ]),
            eb("explanation_languages.is_default", "=", true),
          ]),
          eb("explanations.is_active", "=", true),
          eb("explanation_languages.is_enabled", "=", true),
        ]),
      )
      .orderBy(
        sql`CASE 
          WHEN explanations.language_code = ${language_code} THEN 0 
          WHEN explanations.language_code = ${base_language_code} THEN 1
          ELSE 2 
        END`,
      )
      .execute();

    return { explanation: explanation };
  }

  /**
   * Last chapter read by user
   */
  async saveLastChapterRead({
    id: user_id,
    book_id,
    chapter_id,
  }: Pick<LastChapterReadDto, "id" | "book_id" | "chapter_id">) {
    try {
      const savedLastChapterRead = await this.db
        .getOrCreateConnection()
        .insertInto("user_progress")
        .values({
          book_id,
          chapter_id,
          user_id,
        })
        .execute();
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  async checkChapterReadByUser({
    id: user_id,
    book_id,
  }: Pick<LastChapterReadDto, "id" | "book_id">) {
    const isThereLastChapterRead = await this.db
      .getOrCreateConnection()
      .selectFrom("user_progress")
      .where("user_id", "=", user_id)
      .where("book_id", "=", book_id)
      .select(["user_progress_id"])
      .executeTakeFirst();

    return { isThereLastChapterRead: isThereLastChapterRead ?? null };
  }

  async updateLastChapterRead({
    chapter_id,
    user_progress_id,
  }: Pick<LastChapterReadDto, "chapter_id" | "user_progress_id">) {
    try {
      const updateLastChapterRead = await this.db
        .getOrCreateConnection()
        .updateTable("user_progress")
        .set({
          chapter_id,
          last_visited_at: currentDate(),
        })
        .where("user_progress_id", "=", user_progress_id)
        .execute();
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  async lastChapterReadByUser({ id: user_id }: Pick<UserDto, "id">) {
    const detailsOfTheLastChapterRead = await this.db
      .getOrCreateConnection()
      .selectFrom("user_progress")
      .leftJoin("chapters", "chapters.chapter_id", "user_progress.chapter_id")
      .leftJoin("books", "books.book_id", "chapters.book_id")
      .where("user_id", "=", user_id)
      .select([
        "books.name",
        "books.testament",
        "books.genre_id",
        "chapters.book_id",
        "chapters.chapter_number as chapterNumber",
      ])
      .orderBy("user_progress.last_visited_at", "desc")
      .executeTakeFirst();

    return { detailsOfTheLastChapterRead: detailsOfTheLastChapterRead ?? null };
  }

  /**
   * Rating and explanation
   */
  async saveRating({
    user,
    rating,
    explanation_id,
  }: Pick<RatingDto, "user" | "rating" | "explanation_id">) {
    try {
      const saveRating = await this.db
        .getOrCreateConnection()
        .insertInto("explanation_ratings")
        .values({
          user_id: user.id,
          stars: rating,
          explanation_id: explanation_id,
        })
        .execute();

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  async ratingExists({
    user,
    explanation_id,
  }: Pick<RatingDto, "user" | "explanation_id">) {
    try {
      const ratingExists = await this.db
        .getOrCreateConnection()
        .selectFrom("explanation_ratings")
        .where("explanation_id", "=", explanation_id)
        .where("user_id", "=", user.id)
        .selectAll()
        .executeTakeFirst();
      if (ratingExists) return { exists: true };

      return { exists: false };
    } catch (error) {
      return { exists: false };
    }
  }

  async updateUserRating({
    user,
    explanation_id,
    rating,
  }: Pick<RatingDto, "user" | "rating" | "explanation_id">) {
    try {
      const updateRating = await this.db
        .getOrCreateConnection()
        .updateTable("explanation_ratings")
        .where("explanation_id", "=", explanation_id)
        .where("user_id", "=", user.id)
        .set({
          stars: rating,
        })
        .execute();
      return { updated: true };
    } catch (error) {
      return { updated: false };
    }
  }

  async ratingByUser({
    user,
    explanation_id,
  }: Pick<RatingDto, "user" | "explanation_id">) {
    const userRating = await this.db
      .getOrCreateConnection()
      .selectFrom("explanation_ratings")
      .where("user_id", "=", user.id)
      .where("explanation_id", "=", explanation_id)
      .select(["stars"])
      .executeTakeFirst();

    return { userRating: userRating ?? null };
  }

  async totalUserWhoRated({
    explanation_id,
  }: Pick<RatingDto, "explanation_id">) {
    const totalUserRatings = await this.db
      .getOrCreateConnection()
      .selectFrom("explanation_ratings")
      .where("explanation_id", "=", explanation_id)
      .select((eb) => eb.fn.countAll().as("total_users"))
      .executeTakeFirst();

    return { totalUserRatings: totalUserRatings ?? null };
  }

  async averageRating({ explanation_id }: Pick<RatingDto, "explanation_id">) {
    const averageRating = await this.db
      .getOrCreateConnection()
      .selectFrom("explanation_ratings")
      .where("explanation_id", "=", explanation_id)
      .select((eb) => eb.fn.avg("stars").as("average_rating"))
      .executeTakeFirst();

    return { averageRating: averageRating ?? null };
  }

  /**
   * Favorites
   */
  async getFavorites({ user_id }: { user_id: string }) {
    try {
      console.log("=== BibleRepository.getFavorites ===");
      console.log("DATABASE DEBUG: getFavorites for user_id:", user_id);

      // Log database connection details
      const connection = this.db.getOrCreateConnection();
      console.log("DATABASE DEBUG: Connection info:", {
        database: process.env.POSTGRES_URL
          ? process.env.POSTGRES_URL.split("@")[1]
              ?.split("/")[1]
              ?.split("?")[0] || "URL parsing failed"
          : "Not defined in env",
        connectionType: connection.constructor.name,
      });

      // Debug SQL query construction
      console.log(
        "DATABASE DEBUG: Executing getFavorites query for user:",
        user_id,
      );
      console.log(
        "DATABASE DEBUG: SQL query will join tables: favorites, chapters, books",
      );
      console.log(
        "DATABASE DEBUG: SQL where conditions: favorites.user_id =",
        user_id,
        "AND favorites.type = chapter",
      );

      // Execute query with detailed logging
      console.log("DATABASE DEBUG: Executing database query...");
      const startTime = Date.now();

      const favorites = await connection
        .selectFrom("favorites as f")
        .innerJoin("chapters as c", "f.chapter_id", "c.chapter_id")
        .innerJoin("books as b", "c.book_id", "b.book_id")
        .where("f.user_id", "=", user_id)
        .where("f.type", "=", FavoriteTypeEnum.chapter)
        .select([
          "f.favorite_id",
          "c.chapter_number",
          "c.book_id",
          "b.name as book_name",
        ])
        .execute();

      const endTime = Date.now();
      console.log(`DATABASE DEBUG: Query executed in ${endTime - startTime}ms`);
      console.log("DATABASE DEBUG: Found favorites count:", favorites.length);

      if (favorites.length > 0) {
        console.log(
          "DATABASE DEBUG: First favorite sample:",
          JSON.stringify(favorites[0]),
        );
      } else {
        console.log("DATABASE DEBUG: No favorites found for user");
      }

      return { favorites };
    } catch (error) {
      console.error("DATABASE DEBUG: Error getting favorites:", error);
      if (error instanceof Error) {
        console.error("DATABASE DEBUG: Error details:", error.message);
        console.error("DATABASE DEBUG: Error stack:", error.stack);

        // Check for common database errors
        if (
          error.message.includes("relation") &&
          error.message.includes("does not exist")
        ) {
          console.error("DATABASE DEBUG: Schema error - table may not exist");
        } else if (error.message.includes("permission denied")) {
          console.error(
            "DATABASE DEBUG: Permission error - check database credentials",
          );
        } else if (error.message.includes("connect")) {
          console.error(
            "DATABASE DEBUG: Connection error - check database availability",
          );
        }
      }
      return { favorites: [] };
    }
  }

  async checkFavoriteExists({ user_id, chapter_id }: UserChapterDto) {
    const favorite = await this.db
      .getOrCreateConnection()
      .selectFrom("favorites")
      .where("user_id", "=", user_id)
      .where("chapter_id", "=", chapter_id)
      .where("type", "=", FavoriteTypeEnum.chapter)
      .select("favorite_id")
      .executeTakeFirst();

    return { favorite: favorite ?? null };
  }

  async addFavorite({ user_id, chapter_id }: UserChapterDto) {
    try {
      console.log(
        "Repository: Adding favorite for user:",
        user_id,
        "chapter:",
        chapter_id,
      );

      // Log connection attempt
      console.log("Repository: Attempting database connection for addFavorite");
      const connection = this.db.getOrCreateConnection();
      console.log(
        "Repository: Connection established successfully for addFavorite",
      );

      // Log SQL query details
      console.log("Repository: Executing addFavorite insert query");
      await connection
        .insertInto("favorites")
        .values({
          user_id,
          chapter_id,
          type: FavoriteTypeEnum.chapter,
        })
        .execute();

      console.log("Repository: Successfully added favorite");
      return { success: true };
    } catch (error) {
      console.error("Repository: Error adding favorite:", error);
      if (error instanceof Error) {
        console.error("Repository: Error details:", error.message);
        console.error("Repository: Error stack:", error.stack);

        // Check for specific error types
        if (error.message.includes("foreign key constraint")) {
          console.error(
            "Repository: Foreign key constraint violation - check if user_id and chapter_id exist",
          );
        }
        if (error.message.includes("duplicate key")) {
          console.error(
            "Repository: Duplicate key violation - favorite may already exist",
          );
        }
      }
      return { success: false };
    }
  }

  async removeFavorite({ user_id, chapter_id }: UserChapterDto) {
    try {
      console.log(
        "Repository: Removing favorite for user:",
        user_id,
        "chapter:",
        chapter_id,
      );

      // Log connection attempt
      console.log(
        "Repository: Attempting database connection for removeFavorite",
      );
      const connection = this.db.getOrCreateConnection();
      console.log(
        "Repository: Connection established successfully for removeFavorite",
      );

      // Log SQL query details
      console.log("Repository: Executing removeFavorite delete query");
      const result = await connection
        .deleteFrom("favorites")
        .where("user_id", "=", user_id)
        .where("chapter_id", "=", chapter_id)
        .where("type", "=", FavoriteTypeEnum.chapter)
        .execute();

      console.log("Repository: Delete result:", result);
      return { success: true };
    } catch (error) {
      console.error("Repository: Error removing favorite:", error);
      if (error instanceof Error) {
        console.error("Repository: Error details:", error.message);
        console.error("Repository: Error stack:", error.stack);
      }
      return { success: false };
    }
  }

  async deleteInactiveExplanations(options: {
    language_code: string;
    bookName?: string;
    chapter?: number | "all";
  }) {
    try {
      console.log(
        "[Admin Deletion] Starting deletion of inactive explanations with options:",
        options,
      );
      const { language_code, bookName, chapter } = options;

      console.log(`[Admin Deletion] Using language_code: ${language_code}`);

      let query = this.db
        .getOrCreateConnection()
        .deleteFrom("explanations")
        .where("is_active", "=", false)
        .where("created_by_admin", "=", false)
        .where("language_code", "=", language_code);

      if (bookName) {
        const book = await this.db
          .getOrCreateConnection()
          .selectFrom("books")
          .where("name", "=", bookName)
          .select("book_id")
          .executeTakeFirst();

        if (!book) {
          console.error(`[Admin Deletion] Book ${bookName} not found.`);
          throw new Error(`Book ${bookName} not found.`);
        }
        console.log(`[Admin Deletion] Found book_id: ${book.book_id}`);

        let chapterIdsQuery = this.db
          .getOrCreateConnection()
          .selectFrom("chapters")
          .where("book_id", "=", book.book_id)
          .select("chapter_id");

        if (chapter && chapter !== "all") {
          console.log(`[Admin Deletion] Filtering by chapter: ${chapter}`);
          chapterIdsQuery = chapterIdsQuery.where(
            "chapter_number",
            "=",
            chapter,
          );
        }

        const chapterIds = await chapterIdsQuery.execute();
        const ids = chapterIds.map((c) => c.chapter_id);
        console.log(
          `[Admin Deletion] Found ${ids.length} chapter_ids to target.`,
        );

        if (ids.length === 0) {
          console.log(
            "[Admin Deletion] No chapters matched the criteria. Nothing to delete.",
          );
          return { deletedCount: 0 };
        }

        query = query.where("chapter_id", "in", ids);
      } else {
        console.log(
          "[Admin Deletion] Deleting across all books (language-batch).",
        );
      }

      console.log("[Admin Deletion] Executing final delete query.");
      const result = await query.executeTakeFirst();
      const deleted =
        typeof result?.numDeletedRows === "bigint" ||
        typeof result?.numDeletedRows === "number"
          ? Number(result.numDeletedRows)
          : 0;
      console.log(
        `[Admin Deletion] Successfully deleted ${deleted} explanations.`,
      );
      return { deletedCount: deleted };
    } catch (error) {
      console.error(
        "[Admin Deletion] A critical error occurred during the deletion process:",
        error,
      );
      // Re-throw the error so the service layer can handle it, but now it's logged.
      throw error;
    }
  }

  async setDefaultExplanationsAsActive(options: {
    language_code: string;
    chapterIds: number[];
  }) {
    const { language_code, chapterIds } = options;
    if (chapterIds.length === 0) {
      return { activatedCount: 0 };
    }

    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        // 1. Deactivate all current explanations for the scope
        await trx
          .updateTable("explanations")
          .set({ is_active: false })
          .where("chapter_id", "in", chapterIds)
          .where("language_code", "=", language_code)
          .where("is_active", "=", true)
          .execute();

        // 2. Find the most recent admin-created explanation for each type
        const explanationsToActivate = await trx
          .selectFrom("explanations")
          .select("explanation_id")
          .distinctOn(["chapter_id", "type"])
          .where("chapter_id", "in", chapterIds)
          .where("language_code", "=", language_code)
          .where("created_by_admin", "=", true)
          .orderBy("chapter_id")
          .orderBy("type")
          .orderBy("created_at", "desc")
          .execute();

        if (explanationsToActivate.length === 0) {
          return { activatedCount: 0 };
        }

        const idsToActivate = explanationsToActivate.map(
          (e) => e.explanation_id,
        );

        // 3. Activate the selected default explanations
        const result = await trx
          .updateTable("explanations")
          .set({ is_active: true })
          .where("explanation_id", "in", idsToActivate)
          .executeTakeFirst();

        return { activatedCount: Number(result.numUpdatedRows) };
      });
  }

  async setActiveExplanationsAsDefault(options: {
    language_code: string;
    chapterIds: number[];
  }) {
    const { language_code, chapterIds } = options;
    if (chapterIds.length === 0) {
      return { promotedCount: 0 };
    }

    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        // 1. Demote all current defaults for the scope
        await trx
          .updateTable("explanations")
          .set({ created_by_admin: false })
          .where("chapter_id", "in", chapterIds)
          .where("language_code", "=", language_code)
          .where("created_by_admin", "=", true)
          .execute();

        // 2. Promote all active explanations to be the new defaults
        const result = await trx
          .updateTable("explanations")
          .set({ created_by_admin: true })
          .where("chapter_id", "in", chapterIds)
          .where("language_code", "=", language_code)
          .where("is_active", "=", true)
          .executeTakeFirst();

        return { promotedCount: Number(result.numUpdatedRows) };
      });
  }

  async getExplanationsByFilter(options: {
    language_code: string;
    chapterIds: number[];
    limit: number;
    offset: number;
  }) {
    const { language_code, chapterIds, limit, offset } = options;
    if (chapterIds.length === 0) {
      return { explanations: [], total: 0 };
    }

    const query = this.db
      .getOrCreateConnection()
      .selectFrom("explanations")
      .where("chapter_id", "in", chapterIds)
      .where("language_code", "=", language_code);

    const explanations = await query
      .selectAll()
      .orderBy("explanation_id", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    const totalResult = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();

    return { explanations, total: Number(totalResult?.count) || 0 };
  }

  async setSpecificExplanationVersionAsActive(options: {
    language_code: string;
    chapterIds: number[];
    version: number;
  }) {
    const { language_code, chapterIds, version } = options;
    if (chapterIds.length === 0) {
      return { updatedCount: 0 };
    }

    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        // 1. Deactivate all current explanations for the scope
        await trx
          .updateTable("explanations")
          .set({ is_active: false })
          .where("chapter_id", "in", chapterIds)
          .where("language_code", "=", language_code)
          .where("is_active", "=", true)
          .execute();

        // 2. Activate the explanations with the specific version
        const result = await trx
          .updateTable("explanations")
          .set({ is_active: true })
          .where("chapter_id", "in", chapterIds)
          .where("language_code", "=", language_code)
          .where("version", "=", version)
          .executeTakeFirst();

        return { updatedCount: Number(result.numUpdatedRows) };
      });
  }

  /**
   * Verse Highlight Methods
   */
  async getHighlights({
    user_id,
    chapter_id,
  }: {
    user_id: string;
    chapter_id?: number;
  }) {
    try {
      let query = this.db
        .getOrCreateConnection()
        .selectFrom("verse_highlights")
        .where("user_id", "=", user_id);

      if (chapter_id) {
        query = query.where("chapter_id", "=", chapter_id);
      }

      const highlights = await query
        .selectAll()
        .orderBy("start_verse", "asc")
        .execute();

      return { highlights };
    } catch (error) {
      console.error("Error fetching highlights:", error);
      return { highlights: [] };
    }
  }

  async addHighlight({
    user_id,
    chapter_id,
    start_verse,
    end_verse,
    color = "yellow" as HighlightColorEnum,
    start_char,
    end_char,
    selected_text,
  }: CreateHighlightDto) {
    try {
      const newHighlight: NewVerseHighlights = {
        user_id,
        chapter_id,
        start_verse,
        end_verse,
        color,
        start_char,
        end_char,
        selected_text,
      };

      const result = await this.db
        .getOrCreateConnection()
        .insertInto("verse_highlights")
        .values(newHighlight)
        .returningAll()
        .executeTakeFirst();

      return { highlight: result, success: true };
    } catch (error) {
      console.error("Error adding highlight:", error);
      return { highlight: null, success: false };
    }
  }

  async updateHighlight({ highlight_id, user_id, color }: UpdateHighlightDto) {
    try {
      const result = await this.db
        .getOrCreateConnection()
        .updateTable("verse_highlights")
        .set({ color, updated_at: new Date() })
        .where("highlight_id", "=", highlight_id)
        .where("user_id", "=", user_id)
        .returningAll()
        .executeTakeFirst();

      return { highlight: result, success: !!result };
    } catch (error) {
      console.error("Error updating highlight:", error);
      return { highlight: null, success: false };
    }
  }

  async removeHighlight({ highlight_id, user_id }: DeleteHighlightDto) {
    try {
      const result = await this.db
        .getOrCreateConnection()
        .deleteFrom("verse_highlights")
        .where("highlight_id", "=", highlight_id)
        .where("user_id", "=", user_id)
        .execute();

      return { success: result.length > 0 };
    } catch (error) {
      console.error("Error removing highlight:", error);
      return { success: false };
    }
  }

  async checkHighlightOverlap({
    user_id,
    chapter_id,
    start_verse,
    end_verse,
  }: {
    user_id: string;
    chapter_id: number;
    start_verse: number;
    end_verse: number;
  }) {
    try {
      const overlaps = await this.db
        .getOrCreateConnection()
        .selectFrom("verse_highlights")
        .where("user_id", "=", user_id)
        .where("chapter_id", "=", chapter_id)
        .where((eb) =>
          eb.or([
            // New highlight starts within existing highlight
            eb.and([
              eb("start_verse", "<=", start_verse),
              eb("end_verse", ">=", start_verse),
            ]),
            // New highlight ends within existing highlight
            eb.and([
              eb("start_verse", "<=", end_verse),
              eb("end_verse", ">=", end_verse),
            ]),
            // New highlight completely contains existing highlight
            eb.and([
              eb("start_verse", ">=", start_verse),
              eb("end_verse", "<=", end_verse),
            ]),
          ]),
        )
        .selectAll()
        .execute();

      return { overlaps, hasOverlap: overlaps.length > 0 };
    } catch (error) {
      console.error("Error checking highlight overlap:", error);
      return { overlaps: [], hasOverlap: false };
    }
  }
}
