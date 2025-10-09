import { NotFoundError } from "../../common/errors";
import type { PromptRepository } from "../repository/prompt.repository";
import type { BibleService } from "./bible.service";

export class PromptService {
  constructor(
    private bibleService: BibleService,
    private readonly promptRepository: PromptRepository,
  ) {}

  async referenceBook({
    book_id,
    chapter_number,
    version_id,
  }: { book_id: number; chapter_number: number; version_id: string }) {
    const { book } = await this.bibleService.getBook({
      book_id,
      chapter_number,
      version_id,
    });

    if (!book) {
      throw new NotFoundError("Book not found");
    }

    const chapter = this.formatChapterVerses(book.chapters[0]);

    const reference = `
    Book: ${book.name}
    Chapter: ${chapter}
    `;

    return { reference };
  }

  async getActivePrompt() {
    return this.promptRepository.getActivePrompt();
  }

  private formatChapterVerses(chapterData: {
    chapterNumber: number;
    subtitles: { subtitle: string; start_verse: number; end_verse: number }[];
    verses: { verseNumber: number; text: string }[];
  }): string {
    const { chapterNumber, verses, subtitles } = chapterData;

    const subtitleSections = subtitles.map((subtitle) => {
      const subtitleVerses = verses
        .filter(
          (verse) =>
            verse.verseNumber >= subtitle.start_verse &&
            verse.verseNumber <= subtitle.end_verse,
        )
        .map((verse) => `${verse.verseNumber}\n${verse.text}`)
        .join("\n");
      return `${subtitle.subtitle}\n(${chapterNumber}:${subtitle.start_verse} - ${subtitle.end_verse})\n\n${subtitleVerses}`;
    });

    return `${chapterNumber}\n\n${subtitleSections.join("\n\n")}`;
  }
}
