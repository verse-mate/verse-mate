import type { Topics } from "database/src/models/public/Topics";
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
  }: {
    book_id: number;
    chapter_number: number;
    version_id: string;
  }) {
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

  async getTopicDiscoveryPrompt(category: string) {
    const prompt =
      await this.promptRepository.getUserPromptByType("topic-discovery");
    const template = prompt?.prompt_template ?? "";
    if (!template.includes("{topic_category}")) {
      throw new Error(
        "Topic discovery template missing {topic_category} placeholder",
      );
    }
    return template.replace("{topic_category}", category);
  }

  async getTopicReferencesPrompt(topic: Topics) {
    const prompt =
      await this.promptRepository.getUserPromptByType("topic-references");
    const template = prompt?.prompt_template ?? "";
    if (!template) {
      throw new Error("Active topic-references template not found");
    }
    return template
      .replace("{topic_name}", topic.name)
      .replace("{topic_description}", topic.description || "");
  }

  async getTopicExplanationPrompt(
    topic: Topics,
    placeholders: string,
    languageCode: string,
    type: string,
  ) {
    const prompt =
      await this.promptRepository.getUserPromptByType("topic-explanations");
    const template = prompt?.prompt_template ?? "";
    if (!template) {
      throw new Error("Active topic-explanations template not found");
    }
    return template
      .replace("{explanation_type}", type)
      .replace("{topic_name}", topic.name)
      .replace("{topic_description}", topic.description || "")
      .replace("{bible_placeholders}", placeholders)
      .replace("{language_code}", languageCode);
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
        .map(
          (verse) => `${verse.verseNumber}
${verse.text}`,
        )
        .join("\n");
      return `${subtitle.subtitle}
(${chapterNumber}:${subtitle.start_verse} - ${subtitle.end_verse})

${subtitleVerses}`;
    });

    return `${chapterNumber}

${subtitleSections.join("\n\n")}`;
  }
}
