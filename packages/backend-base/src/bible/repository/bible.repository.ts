import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type { db } from "../../shared/shared.plugin";
import type { BookDto } from "../dto/book/book.dto";
import type { ChapterDto } from "../dto/book/chapter.dto";
import type { LastChapterReadDto } from "../dto/book/last-chapter-read.dto";
import type { RatingDto } from "../dto/book/rating.dto";
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

  async getVerses({ chapter_id }: Pick<ChapterDto, "chapter_id">) {
    const verses = await this.db
      .getOrCreateConnection()
      .selectFrom("verses")
      .where("chapter_id", "=", chapter_id)
      .select(["verses.verse_number as verseNumber", "verses.text"])
      .orderBy("verseNumber", "asc")
      .execute();

    return { verses: verses ?? null };
  }

  async saveExplanation({
    type,
    explanation,
    chapter_id,
  }: {
    type: ExplanationTypeEnum;
    explanation: string;
    chapter_id: number;
  }) {
    const savedExplanation = await this.db
      .getOrCreateConnection()
      .insertInto("explanations")
      .values({
        type,
        explanation,
        chapter_id,
      })
      .execute();

    return { success: true };
  }

  async getChapterId({
    book_id,
    chapter_number,
  }: Pick<ChapterDto, "book_id" | "chapter_number">) {
    const chapter = await this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .where("book_id", "=", book_id)
      .where("chapter_number", "=", chapter_number)
      .select("chapter_id")
      .executeTakeFirst();
    return { chapter_id: chapter?.chapter_id ?? null };
  }

  async getExplanation({
    book_id,
    chapter_number,
  }: Pick<ChapterDto, "book_id" | "chapter_number">) {
    const explanation = await this.db
      .getOrCreateConnection()
      .selectFrom("chapters")
      .leftJoin(
        "explanations",
        "explanations.chapter_id",
        "chapters.chapter_id",
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
        ]),
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
}
