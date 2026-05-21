import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { NotFoundError } from "../../common/errors";
import { type AiProvider, getAiProvider } from "../../shared/ai";
import {
  MIN_SUMMARY_SENTENCES,
  generateChunkedBylineParallel,
  shouldUseBylineChunking,
  toBylineVerses,
  validateSummaryLengths,
} from "../../shared/byline-chunking";
import { getExplanationTypePrompt } from "../../shared/prompt-utils";
import type { db } from "../../shared/shared.plugin";

export class ExplanationRegenerationService {
  private readonly ai: AiProvider;
  private readonly promptRepository: PromptRepository;

  constructor(private readonly db: db) {
    // Per spec feat-integrations br-int-001 (D-001): consume AI through abstraction.
    this.ai = getAiProvider();
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
    const response = await this.ai.responsesCreate({
      model,
      reasoningEffort: effort,
      instructions,
      input,
      maxOutputTokens: maxTokens,
    });

    return response.outputText;
  }

  private getLanguageName(code: string, locale = "en"): string {
    const display = new Intl.DisplayNames([locale], { type: "language" });
    return display.of(code) ?? display.of("en") ?? "English";
  }

  private getUserPrompt({
    explanationPrompt,
    language,
  }: { explanationPrompt: string; language: string }) {
    const cleaned = explanationPrompt
      .replaceAll("{verseRange}", "all verses")
      .replaceAll("{verseRangeContext}", "");
    return `${cleaned}\n\nThe response should be in ${language} using Markdown format only.`;
  }

  /**
   * Run a single-shot generation. For byline output, enforce the
   * VER-120 per-verse summary quality gate (≥ MIN_SUMMARY_SENTENCES per
   * `### Summary`) by retrying once with a corrective hint. Non-byline
   * outputs (summary/detailed) pass through without the per-verse check.
   */
  private async generateSingleShotWithSummaryGate({
    explanationType,
    systemPromptText,
    userPrompt,
    model,
    effort,
    logLabel,
    maxRetries = 1,
  }: {
    explanationType: ExplanationTypeEnum;
    systemPromptText: string;
    userPrompt: string;
    model: string;
    effort: "low" | "medium" | "high";
    logLabel: string;
    maxRetries?: number;
  }): Promise<string> {
    let lastReason = "unknown";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const promptForAttempt =
        attempt === 0
          ? userPrompt
          : `${userPrompt}\n\n- Previous attempt produced one or more verses whose "### Summary" was shorter than ${MIN_SUMMARY_SENTENCES} sentences. Each per-verse "### Summary" MUST contain at least ${MIN_SUMMARY_SENTENCES} complete sentences of prose.`;

      console.log(
        `${logLabel} attempt ${attempt + 1}/${maxRetries + 1} generating`,
      );

      const output = await this.gpt5Text({
        instructions: systemPromptText,
        input: promptForAttempt,
        model,
        effort,
      });

      if (explanationType !== "byline") {
        return output;
      }

      const summaryCheck = validateSummaryLengths(output);
      if (summaryCheck.valid) {
        return output;
      }

      lastReason = summaryCheck.reason;
      const shortDetail = summaryCheck.shortSummaries
        .slice(0, 5)
        .map((s) => `${s.verseHeading} (${s.sentenceCount})`)
        .join(", ");
      console.warn(
        `${logLabel} attempt ${attempt + 1} invalid (${summaryCheck.reason}), short summaries: ${shortDetail}`,
      );
    }

    throw new Error(
      `Single-shot byline regeneration failed quality gate after ${maxRetries + 1} attempt(s): ${lastReason}`,
    );
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

      const verseRows = toBylineVerses(verses);
      const useChunking = shouldUseBylineChunking(
        explanationType,
        verseRows.length,
      );
      const chunkSuffix = useChunking
        ? ` (chunked: ${verseRows.length} verses)`
        : "";

      console.log(
        `[REGENERATION] Generating new explanation for ${book.name} ${chapterNumber}, type: ${explanationType}, model: ${model}${chunkSuffix}`,
      );

      let newExplanationContent: string;

      if (useChunking && verseRows.length > 0) {
        newExplanationContent = await generateChunkedBylineParallel({
          verses: verseRows,
          bookName: book.name,
          chapterNumber,
          bylineTemplate: explanationConfig.prompt,
          logPrefix: "[REGENERATION_BYLINE]",
          generateChunk: async ({ prompt }) =>
            this.gpt5Text({
              instructions: systemPrompt.prompt,
              input: prompt,
              model,
              effort,
              maxTokens: 20000,
            }),
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

        newExplanationContent = await this.generateSingleShotWithSummaryGate({
          explanationType,
          systemPromptText: systemPrompt.prompt,
          userPrompt,
          model,
          effort,
          logLabel: `[REGENERATION_SINGLESHOT] ${book.name} ${chapterNumber} ${explanationType}`,
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
