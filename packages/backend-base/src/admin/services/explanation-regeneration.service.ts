import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { BibleService } from "../../bible/services/bible.service";
import type { db } from "../../shared/shared.plugin";
import { AdminDatabaseService } from "./admin-database.service";

export class ExplanationRegenerationService {
  private bibleService: BibleService;
  private adminDatabaseService: AdminDatabaseService;

  constructor(private readonly db: db) {
    this.bibleService = new BibleService(db, new BibleRepository(db));
    this.adminDatabaseService = new AdminDatabaseService(db);
  }

  async generateNewExplanation(
    regenerationId: string,
    bookId: number,
    chapterNumber: number,
    explanationType: ExplanationTypeEnum,
    bibleVersion: string,
    adminUserId: string,
  ) {
    try {
      const connection = this.db.getOrCreateConnection();

      const { chapter_id } = (await connection
        .selectFrom("chapters")
        .where("book_id", "=", bookId)
        .where("chapter_number", "=", chapterNumber)
        .select("chapter_id")
        .executeTakeFirst()) || { chapter_id: null };

      if (!chapter_id) {
        throw new Error(
          `Chapter ${chapterNumber} not found for book ${bookId}`,
        );
      }

      const book = await connection
        .selectFrom("books")
        .where("book_id", "=", bookId)
        .select("name")
        .executeTakeFirst();

      if (!book) {
        throw new Error(`Book ${bookId} not found`);
      }

      const userPromptRepo = new UserPromptRepository(this.db);
      const promptTemplate =
        await userPromptRepo.getActivePromptByType(explanationType);

      let prompt: string;
      let temperature: number;

      if (promptTemplate && (promptTemplate as any).prompt_template) {
        temperature =
          explanationType === "detailed"
            ? 0.1
            : explanationType === "byline"
              ? 0.2
              : 0.3;
        prompt = (promptTemplate as any).prompt_template
          .replace("{bookName}", book.name)
          .replace("{chapterNumber}", chapterNumber.toString());
      } else {
        switch (explanationType) {
          case "summary":
            prompt =
              "Please provide a concise summary of the following biblical text. Focus on the main themes, key messages, and practical applications. Keep it brief but comprehensive, suitable for quick understanding and reflection.";
            temperature = 0.3;
            break;
          case "byline":
            prompt =
              "Please provide a detailed line-by-line explanation of the following biblical text. Break down each verse or significant phrase, explaining the meaning, context, and significance. Include historical background, cultural context, and theological insights where relevant.";
            temperature = 0.2;
            break;
          case "detailed":
            prompt =
              "Please provide a comprehensive and detailed explanation of the following biblical text. Include thorough analysis of the passage, covering historical context, cultural background, theological significance, literary structure, and practical applications. Provide deep insights suitable for serious study and reflection.";
            temperature = 0.1;
            break;
          default:
            throw new Error(`Unknown explanation type: ${explanationType}`);
        }
      }

      const verses = await connection
        .selectFrom("verses")
        .where("chapter_id", "=", chapter_id)
        .where("version_id", "=", bibleVersion)
        .select(["verse_number", "text"])
        .orderBy("verse_number", "asc")
        .execute();

      if (!verses || verses.length === 0) {
        throw new Error(
          `No verses found for chapter ${chapterNumber} in version ${bibleVersion}`,
        );
      }

      const versesText = verses
        .map((v) => `${v.verse_number}. ${v.text}`)
        .join("\n");
      const fullPrompt = `${prompt}\n\nBiblical Text (${book.name} ${chapterNumber}):\n${versesText}`;

      console.log(
        `[REGENERATION] Generating new explanation for ${book.name} ${chapterNumber}, type: ${explanationType}`,
      );
      console.log(
        `[REGENERATION] Using prompt: ${fullPrompt.substring(0, 200)}...`,
      );

      const newExplanationContent = `[REGENERATED] This is a placeholder for the new AI-generated explanation for ${book.name} ${chapterNumber} (${explanationType}). In a real implementation, this would call the OpenAI API with the prompt and return the generated content.`;

      const originalExplanation = await connection
        .selectFrom("explanations")
        .where("chapter_id", "=", chapter_id)
        .where("type", "=", explanationType)
        .where("version_id", "=", bibleVersion)
        .select("explanation_id")
        .executeTakeFirst();

      if (!originalExplanation) {
        throw new Error("No active explanation found to regenerate");
      }

      const result = await this.adminDatabaseService.saveRegeneratedExplanation(
        regenerationId,
        newExplanationContent,
        originalExplanation.explanation_id,
        chapter_id,
        explanationType,
        bibleVersion,
        adminUserId,
      );

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
