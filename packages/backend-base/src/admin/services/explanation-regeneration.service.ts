import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { NotFoundError } from "../../common/errors";
import { getExplanationTypePrompt } from "../../shared/prompt-utils";
import type { db } from "../../shared/shared.plugin";

const BYLINE_CHUNK_SIZE = 40;
const BYLINE_CHUNK_THRESHOLD = 50;

export class ExplanationRegenerationService {
  private openai: OpenAI;
  private promptRepository: PromptRepository;

  constructor(private readonly db: db) {
    this.openai = new OpenAI({
      apiKey: process.env.OPEN_AI_KEY,
    });
    this.promptRepository = new PromptRepository(this.db);
  }

  private async gpt5Text({
    instructions,
    input,
    model,
    effort = "medium",
    maxTokens = 20000,
  }: {
    instructions?: string;
    input: string;
    model: string;
    effort?: "low" | "medium" | "high";
    maxTokens?: number;
  }) {
    const response = await this.openai.responses.create({
      model,
      reasoning: { effort },
      instructions,
      input,
      max_output_tokens: maxTokens,
    });

    return response.output_text || "";
  }

  private async generateBylineInChunks({
    versesText,
    bookName,
    chapterNumber,
    verseCount,
    instructions,
    model,
    effort,
    language,
  }: {
    versesText: string;
    bookName: string;
    chapterNumber: number;
    verseCount: number;
    instructions?: string;
    model: string;
    effort: "low" | "medium" | "high";
    language: string;
  }): Promise<string> {
    const chunks: string[] = [];

    for (
      let startVerse = 1;
      startVerse <= verseCount;
      startVerse += BYLINE_CHUNK_SIZE
    ) {
      const endVerse = Math.min(startVerse + BYLINE_CHUNK_SIZE - 1, verseCount);
      const isFirst = startVerse === 1;

      const chunkPrompt = `${isFirst ? `# ${bookName} ${chapterNumber}: Verse-by-Verse Analysis\n\n` : ""}Provide a verse-by-verse explanation for **verses ${startVerse} through ${endVerse}** of this chapter. For each verse:
1. Quote the verse using blockquote format (>)
2. Provide a clear summary
3. Include relevant key takeaways
4. Add key definitions as appropriate
5. Highlight theological themes as appropriate

CRITICAL INSTRUCTIONS:
- ONLY cover verses ${startVerse} through ${endVerse}
- Keep chronological order at all times
- Do not group verses unless absolutely necessary
- Ensure takeaways and themes are full sentences
- Use proper markdown formatting with line breaks
${!isFirst ? "- Do NOT include a title heading — this is a continuation" : ""}

Biblical Text (${bookName} ${chapterNumber}):
${versesText}

The response should be in ${language} using Markdown format only.`;

      console.log(
        `  [REGENERATION] Generating byline chunk: verses ${startVerse}-${endVerse}`,
      );

      const chunkText = await this.gpt5Text({
        instructions,
        input: chunkPrompt,
        model,
        effort,
        maxTokens: 20000,
      });

      chunks.push(chunkText);
    }

    return chunks.join("\n\n---\n\n");
  }

  private getLanguageName(code: string, locale = "en"): string {
    const display = new Intl.DisplayNames([locale], { type: "language" });
    return display.of(code) ?? display.of("en") ?? "English";
  }

  private getUserPrompt({
    explanationPrompt,
    language,
  }: { explanationPrompt: string; language: string }) {
    return `${explanationPrompt}\n\nThe response should be in ${language} using Markdown format only.`;
  }

  async generateNewExplanation({
    regenerationId,
    bookId,
    chapterNumber,
    explanationType,
    bibleVersion,
    model,
    effort = "medium",
    sendChapterContext = false,
  }: {
    regenerationId: string;
    bookId: number;
    chapterNumber: number;
    explanationType: ExplanationTypeEnum;
    bibleVersion: string;
    model: string;
    effort?: "low" | "medium" | "high";
    sendChapterContext?: boolean;
  }) {
    try {
      const connection = this.db.getOrCreateConnection();

      const { chapter_id } = (await connection
        .selectFrom("chapters")
        .where("book_id", "=", bookId)
        .where("chapter_number", "=", chapterNumber)
        .select("chapter_id")
        .executeTakeFirst()) || { chapter_id: null };

      if (!chapter_id) {
        throw new NotFoundError(
          `Chapter ${chapterNumber} not found for book ${bookId}`,
        );
      }

      const book = await connection
        .selectFrom("books")
        .where("book_id", "=", bookId)
        .select("name")
        .executeTakeFirst();

      if (!book) {
        throw new NotFoundError(`Book ${bookId} not found`);
      }

      const systemPrompt = await this.promptRepository.getActivePrompt();
      if (!systemPrompt) {
        throw new NotFoundError("No active system prompt found");
      }

      const version = await connection
        .selectFrom("bible_versions")
        .select(["id", "language_code"])
        .where("version_key", "=", bibleVersion)
        .executeTakeFirst();

      if (!version) {
        throw new NotFoundError(`Bible version ${bibleVersion} not found`);
      }

      const language = this.getLanguageName(version.language_code);

      const explanationConfig = await getExplanationTypePrompt(
        explanationType,
        book.name,
        chapterNumber,
        this.db,
        language,
      );

      const verses = await connection
        .selectFrom("verses")
        .where("chapter_id", "=", chapter_id)
        .where("version_id", "=", version.id)
        .select(["verse_number", "text"])
        .orderBy("verse_number", "asc")
        .execute();

      const verseCount = verses.length;
      const useChunking =
        explanationType === ExplanationTypeEnum.byline &&
        verseCount > BYLINE_CHUNK_THRESHOLD;

      console.log(
        `[REGENERATION] Generating new explanation for ${book.name} ${chapterNumber}, type: ${explanationType}, model: ${model}${useChunking ? ` (chunked: ${verseCount} verses)` : ""}`,
      );

      let newExplanationContent: string;

      if (useChunking && verses.length > 0) {
        const versesText = verses
          .map((v) => `${v.verse_number}. ${v.text}`)
          .join("\n");

        newExplanationContent = await this.generateBylineInChunks({
          versesText,
          bookName: book.name,
          chapterNumber,
          verseCount,
          instructions: systemPrompt.prompt,
          model,
          effort,
          language,
        });
      } else {
        let userPrompt: string;

        if (sendChapterContext && verses.length > 0) {
          const versesText = verses
            .map((v) => `${v.verse_number}. ${v.text}`)
            .join("\n");

          userPrompt = this.getUserPrompt({
            explanationPrompt: `${explanationConfig.prompt}\n\nBiblical Text (${book.name} ${chapterNumber}):\n${versesText}`,
            language,
          });
        } else {
          userPrompt = this.getUserPrompt({
            explanationPrompt: explanationConfig.prompt,
            language,
          });
        }

        newExplanationContent = await this.gpt5Text({
          instructions: systemPrompt.prompt,
          input: userPrompt,
          model,
          effort,
        });
      }

      const originalExplanation = await connection
        .selectFrom("explanations")
        .where("chapter_id", "=", chapter_id)
        .where("type", "=", explanationType)
        .where("language_code", "=", version.language_code)
        .select("explanation_id")
        .executeTakeFirst();

      if (!originalExplanation) {
        throw new NotFoundError("No active explanation found to regenerate");
      }

      console.log(`Saving regenerated explanation for ${regenerationId}`);
      console.log(
        `Original ID: ${originalExplanation.explanation_id}, New content length: ${newExplanationContent.length}`,
      );

      const result = {
        success: true,
        regenerationId,
        newExplanation: {
          id: Math.floor(Math.random() * 10000),
          content: newExplanationContent,
          version: 2,
          isActive: false,
        },
        status: "awaiting_admin_choice",
      };

      return {
        success: true,
        regenerationId,
        message: "New explanation generated successfully",
        newExplanation: result.newExplanation,
        status: "awaiting_admin_choice",
      };
    } catch (error) {
      console.error("[REGENERATION] Error generating explanation:", error);
      return {
        success: false,
        regenerationId,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        status: "failed",
      };
    }
  }
}
