import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";
import OpenAI from "openai";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { ForbiddenError, NotFoundError } from "../../common/errors";
import type { db } from "../../shared/shared.plugin";

const PROTECTED_PROMPT_IDS = [1, 2, 3];

interface PlaygroundRequest {
  system_prompt: string;
  user_prompt: string;
  book_name: string;
  chapter_number: number;
  bible_version: string;
  model: string;
  effort: "low" | "medium" | "high";
  send_chapter_context: boolean;
}

export class AdminPromptService {
  private promptRepository: PromptRepository;
  private userPromptRepository: UserPromptRepository;
  private openai: OpenAI;

  constructor(private readonly db: db) {
    this.promptRepository = new PromptRepository(this.db);
    this.userPromptRepository = new UserPromptRepository(this.db);
    const apiKey = process.env.OPEN_AI_KEY;
    if (!apiKey) {
      console.error(
        "ERROR: OPEN_AI_KEY is not set. OpenAI client will not be initialized.",
      );
    }
    this.openai = new OpenAI({ apiKey });
  }

  // --- System Prompt Methods ---

  async getAllSystemPrompts() {
    return this.promptRepository.getAll();
  }

  async createSystemPrompt(prompt: string) {
    // Creates an inactive prompt. Use setSystemPromptStatus to activate.
    return this.promptRepository.create(prompt, PromptStatusEnum.inactive);
  }

  async setSystemPromptStatus(id: number, status: PromptStatusEnum) {
    if (status === PromptStatusEnum.active) {
      await this.promptRepository.setAllInactive();
    }
    await this.promptRepository.setStatus(id, status);
    return {
      success: true,
      message: `System prompt ${id} status set to ${status}`,
    };
  }

  async updateSystemPrompt(id: number, prompt: string) {
    if (PROTECTED_PROMPT_IDS.includes(id)) {
      throw new ForbiddenError("This is a default prompt and cannot be edited");
    }
    await this.promptRepository.update(id, prompt);
    return { success: true, message: `System prompt ${id} updated` };
  }

  async deleteSystemPrompt(id: number) {
    if (PROTECTED_PROMPT_IDS.includes(id)) {
      throw new ForbiddenError(
        "This is a default prompt and cannot be deleted",
      );
    }
    await this.promptRepository.delete(id);
    return { success: true, message: `System prompt ${id} deleted` };
  }

  // --- User Prompt Methods ---

  async getAllUserPrompts() {
    return this.userPromptRepository.getAll();
  }

  async getAllExplanationTypes() {
    const types = await this.db
      .getOrCreateConnection()
      .selectFrom("user_prompt_templates")
      .select("explanation_type")
      .distinct()
      .execute();
    return types.map((t) => t.explanation_type);
  }

  async createUserPrompt(
    templateName: string,
    explanationType: string,
    promptTemplate: string,
  ) {
    // Creates an inactive prompt. Use setUserPromptStatus to activate.
    return this.userPromptRepository.createPromptTemplate(
      templateName,
      explanationType,
      promptTemplate,
      "inactive",
    );
  }

  async setUserPromptStatus(id: number, status: "active" | "inactive") {
    if (status === "active") {
      const type = await this.userPromptRepository.getTypeById(id);
      if (!type) throw new NotFoundError(`Prompt ${id} not found`);
      await this.userPromptRepository.setInactiveByType(type);
    }
    await this.userPromptRepository.setStatus(id, status);
    return {
      success: true,
      message: `User prompt ${id} status set to ${status}`,
    };
  }

  async updateUserPrompt(id: number, promptTemplate: string) {
    if (PROTECTED_PROMPT_IDS.includes(id)) {
      throw new ForbiddenError("This is a default prompt and cannot be edited");
    }
    const result = await this.userPromptRepository.updatePromptTemplate(
      id,
      promptTemplate,
    );
    if (!result.success) {
      throw new NotFoundError(
        `User prompt template ${id} not found or failed to update`,
      );
    }
    return {
      success: true,
      message: `User prompt template ${id} updated`,
    };
  }

  async deleteUserPrompt(id: number) {
    if (PROTECTED_PROMPT_IDS.includes(id)) {
      throw new ForbiddenError(
        "This is a default prompt and cannot be deleted",
      );
    }
    await this.userPromptRepository.delete(id);
    return { success: true, message: `User prompt template ${id} deleted` };
  }

  // --- Restore Defaults Method ---

  async restoreDefaults() {
    // System Prompt: Set ID 3 to active, others inactive.
    await this.setSystemPromptStatus(3, PromptStatusEnum.active);

    // User Prompts: Set IDs 1, 2, 3 to active, others of their type inactive.
    await this.setUserPromptStatus(1, "active");
    await this.setUserPromptStatus(2, "active");
    await this.setUserPromptStatus(3, "active");

    return {
      success: true,
      message: "Default prompts have been restored and set to active.",
    };
  }

  // --- Playground Method ---

  async testPrompts(request: PlaygroundRequest) {
    const {
      system_prompt,
      user_prompt,
      book_name,
      chapter_number,
      bible_version,
      model,
      effort,
      send_chapter_context,
    } = request;

    const connection = this.db.getOrCreateConnection();

    const version = await connection
      .selectFrom("bible_versions")
      .select(["id", "language_code"])
      .where("version_key", "=", bible_version)
      .executeTakeFirst();

    if (!version) {
      throw new NotFoundError(`Bible version ${bible_version} not found`);
    }

    const language = this.getLanguageName(version.language_code);

    const finalUserPrompt = this.getUserPrompt({
      explanationPrompt: user_prompt
        .replace("{bookName}", book_name)
        .replace("{chapterNumber}", chapter_number.toString()),
      language,
    });

    let contextText = "";
    if (send_chapter_context) {
      const book = await connection
        .selectFrom("books")
        .where("name", "=", book_name)
        .select("book_id")
        .executeTakeFirst();
      if (!book) throw new NotFoundError(`Book ${book_name} not found`);

      const chapter = await connection
        .selectFrom("chapters")
        .where("book_id", "=", book.book_id)
        .where("chapter_number", "=", chapter_number)
        .select("chapter_id")
        .executeTakeFirst();
      if (!chapter)
        throw new NotFoundError(
          `Chapter ${chapter_number} not found for book ${book_name}`,
        );

      const verses = await connection
        .selectFrom("verses")
        .where("chapter_id", "=", chapter.chapter_id)
        .where("version_id", "=", version.id)
        .select(["verse_number", "text"])
        .orderBy("verse_number", "asc")
        .execute();

      if (!verses || verses.length === 0) {
        throw new NotFoundError(
          `No verses found for chapter ${chapter_number} in version ${bible_version}`,
        );
      }
      contextText = `\r\n\r\nBiblical Text (${book_name} ${chapter_number}):\r\n${verses.map((v) => `${v.verse_number}. ${v.text}`).join("\n")}`;
    }

    const fullPrompt = `${finalUserPrompt}${contextText}`;

    const aiResponse = await this.gpt5Text({
      instructions: system_prompt,
      input: fullPrompt,
      model,
      effort,
    });

    return { result: aiResponse };
  }

  // --- Private Helpers ---

  private async gpt5Text({
    instructions,
    input,
    model,
    effort,
  }: {
    instructions?: string;
    input: string;
    model: string;
    effort?: "low" | "medium" | "high";
  }) {
    const response = await this.openai.responses.create({
      model,
      reasoning: { effort },
      instructions,
      input,
      max_output_tokens: 50000,
    });
    return response.output_text || "";
  }

  private getLanguageName(code: string, locale = "en"): string {
    const display = new Intl.DisplayNames([locale], { type: "language" });
    return display.of(code) ?? display.of("en") ?? "English";
  }

  private getUserPrompt({
    explanationPrompt,
    language,
  }: { explanationPrompt: string; language: string }) {
    return `${explanationPrompt}\r\n\r\nThe response should be in ${language} using Markdown format only.`;
  }

  async getExistingExplanation(
    bookName: string,
    chapterNumber: number,
    bibleVersion: string,
    explanationType: string,
  ) {
    const connection = this.db.getOrCreateConnection();

    // Get bible version
    const version = await connection
      .selectFrom("bible_versions")
      .select(["id", "language_code"])
      .where("version_key", "=", bibleVersion)
      .executeTakeFirst();

    if (!version) {
      return null; // Bible version not found
    }

    // Get book
    const book = await connection
      .selectFrom("books")
      .where("name", "=", bookName)
      .select("book_id")
      .executeTakeFirst();

    if (!book) {
      return null; // Book not found
    }

    // Get chapter_id for the specific book and chapter
    const chapter = await connection
      .selectFrom("chapters")
      .where("book_id", "=", book.book_id)
      .where("chapter_number", "=", chapterNumber)
      .select("chapter_id")
      .executeTakeFirst();

    if (!chapter) {
      return null; // Chapter not found
    }

    // Get explanation using chapter_id
    const explanation = await connection
      .selectFrom("explanations")
      .where("chapter_id", "=", chapter.chapter_id)
      .where("language_code", "=", version.language_code)
      .where("type", "=", explanationType as ExplanationTypeEnum)
      .select("explanation")
      .executeTakeFirst();

    return explanation?.explanation || null;
  }
}
