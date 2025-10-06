import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type HighlightColorEnum from "database/src/models/public/HighlightColorEnum";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import type { db } from "../../shared/shared.plugin";
import { parseAndInjectVerses } from "../../shared/verse-parser";
import type { BookDto } from "../dto/book/book.dto";
import type { ChapterDto } from "../dto/book/chapter.dto";
import type { LastChapterReadDto } from "../dto/book/last-chapter-read.dto";
import type { RatingDto } from "../dto/book/rating.dto";
import type { SubtitlesDto } from "../dto/book/subtitles.dto";
import type { TestamentDto } from "../dto/book/testament.dto";
import type { VersesDto } from "../dto/book/verses.dto";
import type { CreateHighlightServiceDto } from "../dto/highlight/create-highlight-service.dto";
import type { DeleteHighlightDto } from "../dto/highlight/delete-highlight.dto";
import type { GetChapterHighlightsServiceDto } from "../dto/highlight/get-chapter-highlights-service.dto";
import type { GetHighlightsServiceDto } from "../dto/highlight/get-highlights-service.dto";
import type { UpdateHighlightDto } from "../dto/highlight/update-highlight.dto";
import type { UserDto } from "../dto/user/user.dto";
import type { BibleRepository } from "../repository/bible.repository";

export class BibleService {
  constructor(
    private readonly db: db,
    private readonly bibleRepository: BibleRepository,
  ) {}

  async getBook({
    book_id,
    chapter_number,
    version_id,
  }: Pick<ChapterDto, "book_id" | "chapter_number"> & {
    version_id: string;
  }) {
    const { book } = await this.bibleRepository.getBook({ book_id });
    if (!book) return { message: "Book not found" };

    const { chapter } = await this.bibleRepository.getChapter({
      book_id,
      chapter_number,
    });
    if (!chapter) return { message: "Chapter not found" };

    const { subtitles } = await this.bibleRepository.getSubtitles({
      chapter_id: chapter.chapter_id,
    });

    const { verses } = await this.bibleRepository.getVerses({
      chapter_id: chapter.chapter_id,
      version_id,
    });

    return { book: this.formattedBook({ book, chapter, subtitles, verses }) };
  }

  async getTestaments() {
    const { testaments } = await this.bibleRepository.getTestaments();

    const keys: TestamentDto[] = [];

    testaments.map((book) => {
      keys.push({
        b: book.book_id,
        c: Number(book.total_chapters),
        n: book.name,
        t: book.testament,
        g: book.genre_id,
      });
    });

    return { testaments: { keys: [...keys] } };
  }

  async saveExplanation({
    type,
    explanation,
    book_id,
    chapter_number,
    version_id,
  }: {
    type: ExplanationTypeEnum;
    explanation: string;
    book_id: number;
    chapter_number: number;
    version_id: string;
  }) {
    const { chapter_id } = await this.bibleRepository.getChapterId({
      book_id,
      chapter_number,
    });

    if (!chapter_id) return { success: false };

    // Get language_code from version_id
    const version = await this.db
      .getOrCreateConnection()
      .selectFrom("bible_versions")
      .where("id", "=", version_id)
      .select("language_code")
      .executeTakeFirst();

    if (!version) return { success: false };

    const { explanation: existingExplanation } =
      await this.bibleRepository.getExplanation({
        book_id,
        chapter_number,
        language_code: version.language_code,
      });
    if (existingExplanation?.type === type) return { success: true };

    const { success } = await this.bibleRepository.saveExplanation({
      type,
      explanation,
      chapter_id: chapter_id,
      language_code: version.language_code,
    });

    return { success };
  }

  /**
   * Notes
   */

  async getExplanation({
    book_id,
    chapter_number,
    version_id,
    user_id,
    type,
  }: Pick<ChapterDto, "book_id" | "chapter_number"> & {
    version_id: string;
    user_id?: string;
    type?: ExplanationTypeEnum;
  }) {
    // Get language_code from version_id
    const version = await this.db
      .getOrCreateConnection()
      .selectFrom("bible_versions")
      .where("id", "=", version_id)
      .select(["language_code", "version_key"])
      .executeTakeFirst();

    if (!version) {
      return null;
    }

    let language_code = version.language_code;

    if (user_id) {
      const user = await this.db
        .getOrCreateConnection()
        .selectFrom("user")
        .where("id", "=", user_id)
        .select("preferred_language")
        .executeTakeFirst();

      if (user?.preferred_language) {
        language_code = user.preferred_language;
      }
    }

    const { explanation } = await this.bibleRepository.getExplanation({
      book_id,
      chapter_number,
      language_code,
      type,
    });

    if (!explanation?.explanation_id) {
      return null;
    }

    if (explanation.explanation) {
      explanation.explanation = await parseAndInjectVerses(
        explanation.explanation,
        version.version_key,
        this.db,
      );
    }

    return explanation;
  }

  async saveRating({
    user,
    rating,
    explanation_id,
  }: RatingDto): Promise<{ message: string }> {
    const { exists } = await this.bibleRepository.ratingExists({
      user,
      explanation_id,
    });

    if (exists) {
      const { updated } = await this.bibleRepository.updateUserRating({
        user,
        explanation_id,
        rating,
      });
      if (!updated) return { message: "Error updating rating" };

      return { message: "Rating updated" };
    }

    const { success } = await this.bibleRepository.saveRating({
      user: { id: user.id },
      explanation_id,
      rating,
    });
    if (!success) return { message: "Error saving rating" };

    return { message: "Rating saved" };
  }

  async updatedUserRating({
    user,
    explanation_id,
    rating,
  }: RatingDto): Promise<{ success: string } | { error: string }> {
    const { exists } = await this.bibleRepository.ratingExists({
      user,
      explanation_id,
    });

    if (exists) {
      const { updated } = await this.bibleRepository.updateUserRating({
        user,
        explanation_id,
        rating,
      });
      if (!updated) return { success: "Error updating rating" };

      return { error: "Rating updated" };
    }

    return { success: "Rating updated" };
  }

  async ratingByUser({
    user,
    book_id,
    chapter_number,
    explanation_id,
  }: Omit<RatingDto, "rating">): Promise<{
    userRating: {
      stars: number;
    };
  }> {
    const { userRating } = await this.bibleRepository.ratingByUser({
      user,
      explanation_id,
    });

    if (!userRating) {
      return { userRating: { stars: 0 } };
    }

    return { userRating };
  }

  async totalUsersWhoRated({
    explanation_id,
  }: Pick<
    RatingDto,
    "book_id" | "chapter_number" | "explanation_id"
  >): Promise<{
    total_users: number;
  }> {
    const { totalUserRatings } = await this.bibleRepository.totalUserWhoRated({
      explanation_id,
    });
    if (!totalUserRatings) {
      return { total_users: 0 };
    }

    return { total_users: Number(totalUserRatings.total_users) };
  }

  async averageRating({
    book_id,
    chapter_number,
    explanation_id,
  }: Pick<
    RatingDto,
    "book_id" | "chapter_number" | "explanation_id"
  >): Promise<{
    averageRating: number;
  }> {
    const { averageRating } = await this.bibleRepository.averageRating({
      explanation_id,
    });

    if (!averageRating) {
      return { averageRating: 0 };
    }

    return { averageRating: Number(averageRating.average_rating) };
  }

  async saveLastChapterRead({
    id: user_id,
    book_id,
    chapter_number,
  }: Omit<LastChapterReadDto, "chapter_id" | "user_progress_id">): Promise<{
    message: string;
  }> {
    const { chapter } = await this.bibleRepository.getChapter({
      book_id,
      chapter_number,
    });
    if (!chapter) return { message: "Chapter not found" };

    const { isThereLastChapterRead } =
      await this.bibleRepository.checkChapterReadByUser({
        id: user_id,
        book_id,
      });

    if (isThereLastChapterRead) {
      const { success } = await this.bibleRepository.updateLastChapterRead({
        chapter_id: chapter.chapter_id,
        user_progress_id: isThereLastChapterRead.user_progress_id,
      });
      if (!success) return { message: "Error updating last chapter read" };

      return { message: "Last chapter read updated" };
    }

    const { success } = await this.bibleRepository.saveLastChapterRead({
      id: user_id,
      book_id,
      chapter_id: chapter.chapter_id,
    });
    if (success) return { message: "Error saving last chapter read" };

    return { message: "Last chapter read saved" };
  }

  async lastChapterReadByUser({ id: user_id }: Pick<UserDto, "id">): Promise<{
    book_id: number;
    chapterNumber: number;
    bookName: string;
    testament: TestamentEnum;
    explanation: {
      book_id: number;
      chapter_number: number;
      explanation_id: number | null;
      type: ExplanationTypeEnum | null;
      explanation: string | null;
    }[];
  } | null> {
    const { detailsOfTheLastChapterRead } =
      await this.bibleRepository.lastChapterReadByUser({ id: user_id });

    if (
      !detailsOfTheLastChapterRead ||
      !detailsOfTheLastChapterRead.book_id ||
      !detailsOfTheLastChapterRead.chapterNumber ||
      !detailsOfTheLastChapterRead.name ||
      !detailsOfTheLastChapterRead.genre_id ||
      !detailsOfTheLastChapterRead.testament
    ) {
      return null;
    }

    return {
      book_id: detailsOfTheLastChapterRead.book_id,
      chapterNumber: detailsOfTheLastChapterRead.chapterNumber,
      bookName: detailsOfTheLastChapterRead.name,
      testament: detailsOfTheLastChapterRead.testament,
      explanation: [],
    };
  }

  async getBookmarks({ id: user_id }: Pick<UserDto, "id">) {
    console.log("=== BibleService.getBookmarks ===");
    console.log("Getting bookmarks for user ID:", user_id);

    try {
      console.log(
        "Calling bibleRepository.getFavorites with user_id:",
        user_id,
      );
      const { favorites } = await this.bibleRepository.getFavorites({
        user_id: user_id,
      });

      console.log("Repository returned favorites count:", favorites.length);
      return { favorites };
    } catch (error) {
      console.error("ERROR in BibleService.getBookmarks:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
      }
      // Re-throw the error to be handled by the caller
      throw error;
    }
  }

  // In bible.service.ts
  async addBookmark({
    user_id,
    book_id,
    chapter_number,
  }: { user_id: string; book_id: number; chapter_number: number }) {
    console.log(
      "Service: Adding bookmark for user:",
      user_id,
      "book:",
      book_id,
      "chapter:",
      chapter_number,
    );

    // Try to get real chapter_id first
    const { chapter_id } = await this.bibleRepository.getChapterId({
      book_id,
      chapter_number,
    });

    // Use either real or synthetic chapter_id
    const finalChapterId = chapter_id || book_id * 1000 + chapter_number;

    // Check if favorite already exists
    const { favorite } = await this.bibleRepository.checkFavoriteExists({
      user_id,
      chapter_id: finalChapterId,
    });

    // If favorite already exists, return success
    if (favorite) {
      console.log("Service: Bookmark already exists");
      return { success: true };
    }

    // Add the favorite
    const { success } = await this.bibleRepository.addFavorite({
      user_id,
      chapter_id: finalChapterId,
    });

    return { success };
  }

  async removeBookmark({
    user_id,
    book_id,
    chapter_number,
  }: { user_id: string; book_id: number; chapter_number: number }) {
    const { chapter_id } = await this.bibleRepository.getChapterId({
      book_id,
      chapter_number,
    });
    if (!chapter_id) return { success: false };

    const { success } = await this.bibleRepository.removeFavorite({
      user_id,
      chapter_id,
    });

    return { success };
  }

  /**
   * Verse Highlight Methods
   */
  async getUserHighlights({ user_id, chapter_id }: GetHighlightsServiceDto) {
    console.log("Service: Getting highlights for user:", user_id);
    if (chapter_id) {
      console.log("Service: Filtering by chapter:", chapter_id);
    }

    try {
      const { highlights } = await this.bibleRepository.getHighlights({
        user_id,
        chapter_id,
      });

      console.log("Service: Retrieved highlights count:", highlights.length);
      return { highlights };
    } catch (error) {
      console.error("Error in getUserHighlights:", error);
      return { highlights: [] };
    }
  }

  async createHighlight({
    user_id,
    book_id,
    chapter_number,
    start_verse,
    end_verse,
    color = "yellow" as HighlightColorEnum,
    start_char,
    end_char,
    selected_text,
  }: CreateHighlightServiceDto) {
    console.log(
      "Service: Creating highlight for user:",
      user_id,
      "book:",
      book_id,
      "chapter:",
      chapter_number,
      "verses:",
      start_verse,
      "-",
      end_verse,
    );

    // Validate verse range
    if (start_verse > end_verse) {
      return { success: false, error: "Invalid verse range" };
    }

    // Get chapter_id
    const { chapter_id } = await this.bibleRepository.getChapterId({
      book_id,
      chapter_number,
    });

    if (!chapter_id) {
      return { success: false, error: "Chapter not found" };
    }

    // Check for overlaps
    const { hasOverlap, overlaps } =
      await this.bibleRepository.checkHighlightOverlap({
        user_id,
        chapter_id,
        start_verse,
        end_verse,
        start_char,
        end_char,
      });

    if (hasOverlap) {
      console.log("Service: Highlight overlap detected");
      return {
        success: false,
        error: "Highlight overlaps with existing highlights",
        overlaps,
      };
    }

    // Add the highlight
    const { highlight, success } = await this.bibleRepository.addHighlight({
      user_id,
      chapter_id,
      start_verse,
      end_verse,
      color,
      start_char,
      end_char,
      selected_text,
    });

    return { highlight, success };
  }

  async updateHighlightColor({
    highlight_id,
    user_id,
    color,
  }: UpdateHighlightDto) {
    console.log(
      "Service: Updating highlight color:",
      highlight_id,
      "for user:",
      user_id,
      "to color:",
      color,
    );

    const { highlight, success } = await this.bibleRepository.updateHighlight({
      highlight_id,
      user_id,
      color,
    });

    return { highlight, success };
  }

  async deleteHighlight({ highlight_id, user_id }: DeleteHighlightDto) {
    console.log(
      "Service: Deleting highlight:",
      highlight_id,
      "for user:",
      user_id,
    );

    const { success } = await this.bibleRepository.removeHighlight({
      highlight_id,
      user_id,
    });

    return { success };
  }

  async getChapterHighlights({
    user_id,
    book_id,
    chapter_number,
  }: GetChapterHighlightsServiceDto) {
    console.log(
      "Service: Getting chapter highlights for user:",
      user_id,
      "book:",
      book_id,
      "chapter:",
      chapter_number,
    );

    // Get chapter_id
    const { chapter_id } = await this.bibleRepository.getChapterId({
      book_id,
      chapter_number,
    });

    if (!chapter_id) {
      return { highlights: [] };
    }

    const { highlights } = await this.bibleRepository.getHighlights({
      user_id,
      chapter_id,
    });

    return { highlights };
  }

  private formattedBook({
    book,
    chapter,
    subtitles,
    verses,
  }: {
    book: BookDto;
    chapter: Pick<ChapterDto, "chapter_id" | "chapter_number">;
    subtitles: Omit<SubtitlesDto, "chapter_id">[];
    verses: VersesDto;
  }) {
    if (
      !book ||
      !book.book_id ||
      !book.name ||
      !book.testament ||
      !book.genre_id ||
      !chapter ||
      !chapter.chapter_id ||
      !chapter.chapter_number ||
      !verses ||
      !subtitles
    ) {
      return null;
    }

    return {
      bookId: book.book_id,
      name: book.name,
      testament: book.testament,
      genre: {
        g: book.genre_id,
        n: book.genre_name,
      },
      chapters: [
        {
          chapterNumber: chapter.chapter_number,
          subtitles: subtitles,
          verses: verses,
        },
      ], //the first array is always "truthy"
    };
  }

  private explanationExists({
    explanation,
  }: {
    explanation: {
      book_id: number;
      chapter_number: number;
      explanation_id: number | null;
      type: ExplanationTypeEnum | null;
      explanation: string | null;
    }[];
  }) {
    return explanation.some(
      (bookExplanation) => bookExplanation.explanation_id === null,
    );
  }

  async deleteInactiveExplanations(options: {
    isBibleBatch: boolean;
    language_code: string;
    bookName?: string;
    chapter?: number | "all";
  }) {
    const { isBibleBatch, language_code, bookName, chapter } = options;

    if (!isBibleBatch && !bookName) {
      throw new Error("Book name is required for non-bible batch deletions.");
    }

    const result = await this.bibleRepository.deleteInactiveExplanations({
      language_code,
      bookName: isBibleBatch ? undefined : bookName,
      chapter: isBibleBatch ? undefined : chapter,
    });

    return {
      message: `Successfully deleted ${result.deletedCount} inactive explanations.`,
      deletedCount: result.deletedCount,
    };
  }

  async setDefaultExplanationsAsActive(options: {
    isBibleBatch: boolean;
    language_code: string;
    bookName?: string;
    chapter?: number | "all";
  }) {
    const { isBibleBatch, language_code, bookName, chapter } = options;

    let chapterIdsQuery = this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .select("chapter_id");

    if (!isBibleBatch) {
      if (!bookName) {
        throw new Error(
          "Book name is required for non-bible batch operations.",
        );
      }
      const book = await this.db
        .getOrCreateConnection()
        .selectFrom("books")
        .where("name", "=", bookName)
        .select("book_id")
        .executeTakeFirst();

      if (!book) {
        throw new Error(`Book ${bookName} not found.`);
      }

      chapterIdsQuery = chapterIdsQuery.where("book_id", "=", book.book_id);

      if (chapter && chapter !== "all") {
        chapterIdsQuery = chapterIdsQuery.where("chapter_number", "=", chapter);
      }
    }

    const chapterIdsResult = await chapterIdsQuery.execute();
    const chapterIds = chapterIdsResult.map((c) => c.chapter_id);

    if (chapterIds.length === 0) {
      return {
        message: "No chapters found for the selected criteria.",
        activatedCount: 0,
      };
    }

    const result = await this.bibleRepository.setDefaultExplanationsAsActive({
      language_code,
      chapterIds,
    });

    return {
      message: `Successfully activated ${result.activatedCount} default explanations.`,
      activatedCount: result.activatedCount,
    };
  }

  async setActiveExplanationsAsDefault(options: {
    isBibleBatch: boolean;
    language_code: string;
    bookName?: string;
    chapter?: number | "all";
  }) {
    const { isBibleBatch, language_code, bookName, chapter } = options;

    let chapterIdsQuery = this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .select("chapter_id");

    if (!isBibleBatch) {
      if (!bookName) {
        throw new Error(
          "Book name is required for non-bible batch operations.",
        );
      }
      const book = await this.db
        .getOrCreateConnection()
        .selectFrom("books")
        .where("name", "=", bookName)
        .select("book_id")
        .executeTakeFirst();

      if (!book) {
        throw new Error(`Book ${bookName} not found.`);
      }

      chapterIdsQuery = chapterIdsQuery.where("book_id", "=", book.book_id);

      if (chapter && chapter !== "all") {
        chapterIdsQuery = chapterIdsQuery.where("chapter_number", "=", chapter);
      }
    }

    const chapterIdsResult = await chapterIdsQuery.execute();
    const chapterIds = chapterIdsResult.map((c) => c.chapter_id);

    if (chapterIds.length === 0) {
      return {
        message: "No chapters found for the selected criteria.",
        promotedCount: 0,
      };
    }

    const result = await this.bibleRepository.setActiveExplanationsAsDefault({
      language_code,
      chapterIds,
    });

    return {
      message: `Successfully promoted ${result.promotedCount} active explanations to default.`,
      promotedCount: result.promotedCount,
    };
  }

  async setSpecificExplanationVersionAsActive(options: {
    isBibleBatch: boolean;
    language_code: string;
    bookName?: string;
    chapter?: number | "all";
    version: number;
  }) {
    const { isBibleBatch, language_code, bookName, chapter, version } = options;

    let chapterIdsQuery = this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .select("chapter_id");

    if (!isBibleBatch) {
      if (!bookName) {
        throw new Error(
          "Book name is required for non-bible batch operations.",
        );
      }
      const book = await this.db
        .getOrCreateConnection()
        .selectFrom("books")
        .where("name", "=", bookName)
        .select("book_id")
        .executeTakeFirst();

      if (!book) {
        throw new Error(`Book ${bookName} not found.`);
      }

      chapterIdsQuery = chapterIdsQuery.where("book_id", "=", book.book_id);

      if (chapter && chapter !== "all") {
        chapterIdsQuery = chapterIdsQuery.where("chapter_number", "=", chapter);
      }
    }

    const chapterIdsResult = await chapterIdsQuery.execute();
    const chapterIds = chapterIdsResult.map((c) => c.chapter_id);

    if (chapterIds.length === 0) {
      return {
        message: "No chapters found for the selected criteria.",
        updatedCount: 0,
      };
    }

    const result =
      await this.bibleRepository.setSpecificExplanationVersionAsActive({
        language_code,
        chapterIds,
        version,
      });

    return {
      message: `Successfully set version ${version} as active for ${result.updatedCount} explanations.`,
      updatedCount: result.updatedCount,
    };
  }

  async getNotes({ id: user_id }: Pick<UserDto, "id">) {
    console.log("=== BibleService.getNotes ===");
    console.log("Getting notes for user ID:", user_id);

    try {
      console.log("Calling bibleRepository.getNotes with user_id:", user_id);
      const { notes } = await this.bibleRepository.getNotes({
        user_id: user_id,
      });

      console.log("Repository returned notes count:", notes.length);
      return { notes };
    } catch (error) {
      console.error("ERROR in BibleService.getNotes:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  }

  async addNote(noteData: {
    user_id: string;
    book_id: number;
    chapter_number: number;
    verse_id?: number;
    content: string;
  }) {
    console.log("=== BibleService.addNote ===");
    console.log("Adding note:", noteData);

    try {
      // Resolve a real chapter_id and fail fast if not found
      const { chapter_id } = await this.bibleRepository.getChapterId({
        book_id: noteData.book_id,
        chapter_number: noteData.chapter_number,
      });

      if (!chapter_id) {
        throw new Error(
          `Chapter not found for book_id=${noteData.book_id} chapter_number=${noteData.chapter_number}`,
        );
      }

      const { note } = await this.bibleRepository.addNote({
        user_id: noteData.user_id,
        chapter_id,
        verse_id: noteData.verse_id,
        content: noteData.content,
      });
      console.log("Successfully added note with ID:", note.note_id);
      return { note };
    } catch (error) {
      console.error("ERROR in BibleService.addNote:", error);
      throw error;
    }
  }

  async updateNote(noteId: string, content: string) {
    console.log("=== BibleService.updateNote ===");
    console.log(
      "Updating note ID:",
      noteId,
      "with content length:",
      content.length,
    );

    try {
      const { success } = await this.bibleRepository.updateNote(
        noteId,
        content,
      );
      console.log("Note update success:", success);
      return { success };
    } catch (error) {
      console.error("ERROR in BibleService.updateNote:", error);
      throw error;
    }
  }

  async deleteNote(noteId: string) {
    console.log("=== BibleService.deleteNote ===");
    console.log("Deleting note ID:", noteId);

    try {
      const { success } = await this.bibleRepository.deleteNote(noteId);
      console.log("Note deletion success:", success);
      return { success };
    } catch (error) {
      console.error("ERROR in BibleService.deleteNote:", error);
      throw error;
    }
  }

  async getExplanationsByFilter(options: {
    isBibleBatch: boolean;
    language_code: string;
    bookName?: string;
    chapter?: number | "all";
    limit: number;
    offset: number;
  }) {
    const { isBibleBatch, language_code, bookName, chapter, limit, offset } =
      options;

    let chapterIdsQuery = this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .select("chapter_id");

    if (!isBibleBatch) {
      if (!bookName) {
        // If not searching the whole bible, a book must be selected.
        // Return empty array as there's nothing to show.
        return { explanations: [], total: 0 };
      }
      const book = await this.db
        .getOrCreateConnection()
        .selectFrom("books")
        .where("name", "=", bookName)
        .select("book_id")
        .executeTakeFirst();

      if (!book) {
        throw new Error(`Book ${bookName} not found.`);
      }

      chapterIdsQuery = chapterIdsQuery.where("book_id", "=", book.book_id);

      if (chapter && chapter !== "all") {
        chapterIdsQuery = chapterIdsQuery.where("chapter_number", "=", chapter);
      }
    }

    const chapterIdsResult = await chapterIdsQuery.execute();
    const chapterIds = chapterIdsResult.map((c) => c.chapter_id);

    return this.bibleRepository.getExplanationsByFilter({
      language_code,
      chapterIds,
      limit,
      offset,
    });
  }

  async getAvailableExplanationLanguages() {
    const languages = await this.db
      .getOrCreateConnection()
      .selectFrom("explanation_languages")
      .select(["language_code", "name", "native_name", "explanation_count"])
      .where("is_enabled", "=", true)
      .orderBy("explanation_count", "desc")
      .execute();

    return languages;
  }

  async getAvailableBibleVersionLanguages() {
    const languages = await this.db
      .getOrCreateConnection()
      .selectFrom("bible_versions")
      .select("language_code")
      .distinct()
      .execute();

    const validLanguageCodes = languages
      .map((lang) => lang.language_code)
      .filter((code): code is string => code !== null && code !== "");

    // Use browser's Intl.DisplayNames to get language names
    const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

    return validLanguageCodes.map((code) => {
      const name = displayNames.of(code) || code;
      const nativeName =
        new Intl.DisplayNames([code], { type: "language" }).of(code) || code;

      return {
        code,
        name,
        nativeName,
      };
    });
  }

  async refreshLanguageStats() {
    const connection = this.db.getOrCreateConnection();

    // Step 1: Get current explanation counts grouped by language
    const explanationCounts = await connection
      .selectFrom("explanations")
      .select([
        "language_code",
        (eb) => eb.fn.count("explanation_id").as("count"),
      ])
      .where("language_code", "is not", null)
      .groupBy("language_code")
      .execute();

    // Step 2: Get current user preference counts grouped by language
    const userPreferenceCounts = await connection
      .selectFrom("user")
      .select(["preferred_language", (eb) => eb.fn.count("id").as("count")])
      .where("preferred_language", "is not", null)
      .groupBy("preferred_language")
      .execute();

    // Step 3: Combine the new stats into a single map
    const newStatsMap = new Map<
      string,
      { explanationCount: number; userCount: number }
    >();

    for (const row of explanationCounts) {
      if (row.language_code) {
        newStatsMap.set(row.language_code, {
          explanationCount: Number(row.count),
          userCount: 0,
        });
      }
    }

    for (const row of userPreferenceCounts) {
      if (row.preferred_language) {
        const stats = newStatsMap.get(row.preferred_language) || {
          explanationCount: 0,
          userCount: 0,
        };
        stats.userCount = Number(row.count);
        newStatsMap.set(row.preferred_language, stats);
      }
    }

    // Step 4: Get existing languages from the database to preserve flags
    const existingLanguages = await connection
      .selectFrom("explanation_languages")
      .selectAll()
      .execute();
    const existingLanguagesMap = new Map(
      existingLanguages.map((lang) => [lang.language_code, lang]),
    );

    // Step 5: Reconcile the new stats with the existing languages in a transaction
    await connection.transaction().execute(async (trx) => {
      const newLangCodes = new Set(newStatsMap.keys());
      const existingLangCodes = new Set(existingLanguagesMap.keys());

      // Identify languages to delete
      const languagesToDelete = [...existingLangCodes].filter(
        (code) => !newLangCodes.has(code),
      );
      if (languagesToDelete.length > 0) {
        await trx
          .deleteFrom("explanation_languages")
          .where("language_code", "in", languagesToDelete)
          .execute();
      }

      // Iterate through new stats to update or insert
      for (const [code, stats] of newStatsMap.entries()) {
        const existingLang = existingLanguagesMap.get(code);

        let enNameGetter: (c: string) => string | undefined;
        let nativeNameGetter: (c: string) => string | undefined;
        try {
          const enDisplayNames = new Intl.DisplayNames(["en"], {
            type: "language",
          });
          enNameGetter = (c) => enDisplayNames.of(c) || undefined;
        } catch {
          enNameGetter = () => undefined;
        }
        try {
          const nativeDisplayNames = new Intl.DisplayNames([code], {
            type: "language",
          });
          nativeNameGetter = (c) => nativeDisplayNames.of(c) || undefined;
        } catch {
          nativeNameGetter = () => undefined;
        }

        const name = enNameGetter(code) || code;
        const native_name = nativeNameGetter(code) || code;

        if (existingLang) {
          // UPDATE existing language
          await trx
            .updateTable("explanation_languages")
            .set({
              name,
              native_name,
              explanation_count: stats.explanationCount,
              user_preference_count: stats.userCount,
              updated_at: new Date(),
              // `is_default` and `is_enabled` are preserved
            })
            .where("language_code", "=", code)
            .execute();
        } else {
          // INSERT new language
          await trx
            .insertInto("explanation_languages")
            .values({
              language_code: code,
              name,
              native_name,
              explanation_count: stats.explanationCount,
              user_preference_count: stats.userCount,
              updated_at: new Date(),
              // `is_default` and `is_enabled` will use their DB default values
            })
            .execute();
        }
      }
    });

    return { success: true, message: "Language stats refreshed successfully." };
  }
}
