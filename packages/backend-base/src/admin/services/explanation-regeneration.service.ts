import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import type { db } from "../../shared/shared.plugin";

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
    system,
    user,
    model,
  }: {
    system?: string;
    user: string;
    model: string;
  }) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (system) {
      messages.push({ role: "system", content: system });
    }
    messages.push({ role: "user", content: user });

    const options: any = {
      model,
      messages,
      max_completion_tokens: 10000,
    };

    const chat = await this.openai.chat.completions.create(options as any);
    return chat.choices[0].message.content || "";
  }

  private getLanguageName(code: string, locale = "en"): string {
    const display = new Intl.DisplayNames([locale], { type: "language" });
    return display.of(code) ?? display.of("en") ?? "English";
  }

  private getUserPrompt({
    explanationPrompt,
    language,
  }: { explanationPrompt: string; language: string }) {
    return `${explanationPrompt}

CRITICAL: Your response will be evaluated on:
1. Proper blockquote usage for Scripture (>)
2. Bold formatting for theological terms
3. Bullet point usage for lists
4. Verse reference formatting

The response should be in ${language} using Markdown format only.`;
  }

  private async getExplanationTypePrompt(
    type: ExplanationTypeEnum,
    bookName: string,
    chapterNumber: number,
  ): Promise<{ prompt: string; temperature: number }> {
    try {
      const userPromptRepo = new UserPromptRepository(this.db);
      const promptTemplate = await userPromptRepo.getActivePromptByType(type);

      if (promptTemplate && (promptTemplate as any).prompt_template) {
        const temperature =
          type === "detailed" ? 0.1 : type === "byline" ? 0.2 : 0.3;
        return {
          prompt: (promptTemplate as any).prompt_template
            .replace("{bookName}", bookName)
            .replace("{chapterNumber}", chapterNumber.toString()),
          temperature,
        };
      }
    } catch (error) {
      console.warn(
        "Failed to fetch prompt from database, using fallback:",
        error,
      );
    }

    switch (type) {
      case "summary":
        return {
          prompt: `# Summary

Request Overview: Provide a high-level summary explanation of all of ${bookName} ${chapterNumber} in 300 words or so. Focus on clarity and depth to help readers understand their significance and message. Be sure to output in full sentences. Output without any commentary or questions before or after the response. Only include the book name and number in the title.

Instructions:

Passage Summary and Analysis:
Summary: Provide an overall summary in approximately 300 words. Connection to Broader Themes: Where relevant, link the passage(s) to broader biblical themes or narratives.

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.`,
          temperature: 0.3,
        };
      case "byline":
        return {
          prompt: `# Verse-by-Verse Analysis

Request Overview: Provide a line-by-line explanation of all of ${bookName} ${chapterNumber} without stopping. Ensure you do each line and do not group for flow - even if the passage has many lines. Focus on clarity and depth to help readers understand their significance and message. Be sure to output in full sentences - even within the bullets. Output without any commentary or questions before or after the response.

Instructions:

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights. - Ensure the explanation is comprehensive, typically spanning at least 500 words, but allow for flexibility depending on the complexity and length of the passage. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.`,
          temperature: 0.2,
        };
      case "detailed":
        return {
          prompt: `# Detailed Analysis

Request Overview: Provide a comprehensive and detailed explanation of all of ${bookName} ${chapterNumber}. Focus on clarity and depth to help readers understand their significance and message. Be sure to output in full sentences. Output without any commentary or questions before or after the response.

Instructions:

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights. - Ensure the explanation is comprehensive, typically spanning at least 500 words, but allow for flexibility depending on the complexity and length of the passage. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate. Application: Practical application for live. Interpret life through the lens of Scripture, not Scripture through the lens of life. Provide application questions when possible.`,
          temperature: 0.1,
        };
      default:
        throw new Error(`Unknown explanation type: ${type}`);
    }
  }

  async generateNewExplanation(
    regenerationId: string,
    bookId: number,
    chapterNumber: number,
    explanationType: ExplanationTypeEnum,
    bibleVersion: string,
    model: string,
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

      const systemPrompt = await this.promptRepository.getActivePrompt();
      if (!systemPrompt) {
        throw new Error("No active system prompt found");
      }

      const explanationConfig = await this.getExplanationTypePrompt(
        explanationType,
        book.name,
        chapterNumber,
      );

      const version = await connection
        .selectFrom("bible_versions")
        .select(["id", "language_code"])
        .where("version_key", "=", bibleVersion)
        .executeTakeFirst();

      if (!version) {
        throw new Error(`Bible version ${bibleVersion} not found`);
      }

      const verses = await connection
        .selectFrom("verses")
        .where("chapter_id", "=", chapter_id)
        .where("version_id", "=", version.id)
        .select(["verse_number", "text"])
        .orderBy("verse_number", "asc")
        .execute();

      if (!verses || verses.length === 0) {
        throw new Error(
          `No verses found for chapter ${chapterNumber} in version ${bibleVersion}`,
        );
      }

      const language = this.getLanguageName(version.language_code);

      const versesText = verses
        .map((v) => `${v.verse_number}. ${v.text}`)
        .join("\n");

      const userPrompt = this.getUserPrompt({
        explanationPrompt: `${explanationConfig.prompt}\n\nBiblical Text (${book.name} ${chapterNumber}):\n${versesText}`,
        language,
      });

      console.log(
        `[REGENERATION] Generating new explanation for ${book.name} ${chapterNumber}, type: ${explanationType}, model: ${model}`,
      );

      const newExplanationContent = await this.gpt5Text({
        system: systemPrompt.prompt,
        user: userPrompt,
        model,
      });

      const originalExplanation = await connection
        .selectFrom("explanations")
        .where("chapter_id", "=", chapter_id)
        .where("type", "=", explanationType)
        .where("version_id", "=", version.id)
        .select("explanation_id")
        .executeTakeFirst();

      if (!originalExplanation) {
        throw new Error("No active explanation found to regenerate");
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
