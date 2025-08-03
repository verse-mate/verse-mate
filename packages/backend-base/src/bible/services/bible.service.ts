import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import type TestamentEnum from "database/src/models/public/TestamentEnum";
import type { db } from "../../shared/shared.plugin";
import type { BookDto } from "../dto/book/book.dto";
import type { ChapterDto } from "../dto/book/chapter.dto";
import type { LastChapterReadDto } from "../dto/book/last-chapter-read.dto";
import type { RatingDto } from "../dto/book/rating.dto";
import type { SubtitlesDto } from "../dto/book/subtitles.dto";
import type { TestamentDto } from "../dto/book/testament.dto";
import type { VersesDto } from "../dto/book/verses.dto";
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

    const { explanation: explanations } =
      await this.bibleRepository.getExplanation({
        book_id,
        chapter_number,
        version_id,
      });
    const explanationTypeExists = explanations.some(
      (explanation) => explanation.type === type,
    );
    if (explanationTypeExists) return { success: true };

    const { success } = await this.bibleRepository.saveExplanation({
      type,
      explanation,
      chapter_id: chapter_id,
      version_id,
    });

    return { success };
  }

  async getExplanation({
    book_id,
    chapter_number,
    version_id,
  }: Pick<ChapterDto, "book_id" | "chapter_number"> & {
    version_id: string;
  }) {
    const { explanation } = await this.bibleRepository.getExplanation({
      book_id,
      chapter_number,
      version_id,
    });

    const explanationExists = this.explanationExists({ explanation });

    if (explanationExists) {
      return [];
    }

    return explanation;
  }

  async saveRating({
    user,
    book_id,
    chapter_number,
    rating,
    explanation_id,
  }: RatingDto): Promise<{ message: string }> {
    const { explanation } = await this.bibleRepository.getExplanation({
      book_id,
      chapter_number,
      version_id: "NASB1995", // TODO: FIX THIS
    });
    const explanationExists = this.explanationExists({ explanation });
    if (explanationExists) return { message: "Explanation not found" };

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
    book_id,
    chapter_number,
    explanation_id,
    rating,
  }: RatingDto): Promise<{ success: string } | { error: string }> {
    const { explanation } = await this.bibleRepository.getExplanation({
      book_id,
      chapter_number,
      version_id: "NASB1995", // TODO: FIX THIS
    });
    if (!explanation || !explanation_id)
      return { error: "Explanation not found" };

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
    const { explanation } = await this.bibleRepository.getExplanation({
      book_id,
      chapter_number,
      version_id: "NASB1995", // TODO: FIX THIS
    });
    const explanationExists = this.explanationExists({ explanation });
    if (explanationExists) return { userRating: { stars: 0 } };

    const { userRating } = await this.bibleRepository.ratingByUser({
      user,
      explanation_id,
    });
    if (!userRating) return { userRating: { stars: 0 } };

    return { userRating };
  }

  async totalUsersWhoRated({
    book_id,
    chapter_number,
    explanation_id,
  }: Pick<
    RatingDto,
    "book_id" | "chapter_number" | "explanation_id"
  >): Promise<{
    total_users: number;
  }> {
    const { explanation } = await this.bibleRepository.getExplanation({
      book_id,
      chapter_number,
      version_id: "NASB1995", // TODO: FIX THIS
    });
    const explanationExists = this.explanationExists({ explanation });
    if (explanationExists) return { total_users: 0 };

    const { totalUserRatings } = await this.bibleRepository.totalUserWhoRated({
      explanation_id,
    });
    if (!totalUserRatings) return { total_users: 0 };

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
    const { explanation } = await this.bibleRepository.getExplanation({
      book_id,
      chapter_number,
      version_id: "NASB1995", // TODO: FIX THIS
    });
    const explanationExists = this.explanationExists({ explanation });
    if (explanationExists) return { averageRating: 0 };

    const { averageRating } = await this.bibleRepository.averageRating({
      explanation_id,
    });
    if (!averageRating) return { averageRating: 0 };

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
    )
      return null;

    const { explanation } = await this.bibleRepository.getExplanation({
      book_id: detailsOfTheLastChapterRead.book_id,
      chapter_number: detailsOfTheLastChapterRead.chapterNumber,
      version_id: "NASB1995", // TODO: FIX THIS
    });

    return {
      book_id: detailsOfTheLastChapterRead.book_id,
      chapterNumber: detailsOfTheLastChapterRead.chapterNumber,
      bookName: detailsOfTheLastChapterRead.name,
      testament: detailsOfTheLastChapterRead.testament,
      explanation: explanation,
    };
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
      chapters:
        [
          {
            chapterNumber: chapter.chapter_number,
            subtitles: subtitles,
            verses: verses,
          },
        ] || [],
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
}
