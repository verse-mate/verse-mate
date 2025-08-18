import * as fs from "node:fs";
import * as path from "node:path";
import type { Queue } from "bullmq";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { BibleService } from "../../bible/services/bible.service";
import { PromptService } from "../../bible/services/prompt.service";
import { BATCH_MONITORING_QUEUE } from "../../queue/batch-monitoring.queue";
import type { db } from "../../shared/shared.plugin";

interface BatchJobRequest {
  custom_id: string;
  method: "POST";
  url: "/v1/chat/completions";
  body: {
    model: string;
    messages: Array<{ role: "system" | "user"; content: string }>;
    max_completion_tokens: number;
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

const getExplanationTypePrompt = async (
  type: ExplanationTypeEnum,
  bookName: string,
  chapterNumber: number,
  dbInstance: any,
): Promise<{ prompt: string }> => {
  try {
    const userPromptRepo = new UserPromptRepository(dbInstance);
    const promptTemplate = await userPromptRepo.getActivePromptByType(type);

    if (promptTemplate && (promptTemplate as any).prompt_template) {
      return {
        prompt: (promptTemplate as any).prompt_template
          .replace("{bookName}", bookName)
          .replace("{chapterNumber}", chapterNumber.toString()),
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
        prompt: `# Summary\n\nRequest Overview: Provide a high-level summary explanation of all of ${bookName} ${chapterNumber} in 300 words or so. Focus on clarity and depth to help readers understand their significance and message. Be sure to output in full sentences. Output without any commentary or questions before or after the response. Only include the book name and number in the title.\n\nInstructions:\n
Passage Summary and Analysis:
Summary: Provide an overall summary in approximately 300 words. Connection to Broader Themes: Where relevant, link the passage(s) to broader biblical themes or narratives.

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.`,
      };
    case "byline":
      return {
        prompt: `# Verse-by-Verse Analysis\n\nRequest Overview: Provide a line-by-line explanation of all of ${bookName} ${chapterNumber} without stopping. Ensure you do each line and do not group for flow - even if the passage has many lines. Focus on clarity and depth to help readers understand their significance and message. Be sure to output in full sentences - even within the bullets. Output without any commentary or questions before or after the response.\n\nInstructions:\n
Introduction: Begin with the verse

Passage Summary and Analysis:
Summary: Provide and overall summary of the verse in at least 3-4 sentences. Analysis: Provide an analysis of the verse focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details. Include relevant definitions as appropriate. Be sure that each analysis can standalone.

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate.`,
      };
    case "detailed":
      return {
        prompt: `# In-Depth Analysis\n\nRequest Overview: Provide an in-depth yet accessible explanation of all of ${bookName} ${chapterNumber} 500 words per section. Focus on clarity and depth to help readers understand their significance and message. Do not include the verses in the output before the introduction. Be sure to output in full sentences - even within the bullets. Output without any commentary or questions before or after the response.\n\nInstructions:\n
Introduction: Begin with a brief introduction that contextualizes the passage within the Bible, highlighting its place in the broader narrative and any relevant background information.

Passage Analysis:
Analysis: Provide a detailed examination focusing on key themes, insights, and theological implications. Organize major points using subheadings, and emphasize critical details. Be sure that each analysis can standalone. - Connection to Broader Themes: Where relevant, link the passage(s) to broader biblical themes or narratives.

Overall Significance: Conclude with a discussion on the overall significance of the passage. Address how it contributes to the overarching narrative of the Bible and its relevance to contemporary readers.

Formatting: - Use Markdown for the response, with clear headings for the passages, subheadings for major analysis points, and bullet points for key insights. - Ensure the explanation is comprehensive, typically spanning at least 500 words, but allow for flexibility depending on the complexity and length of the passage. - Aim for readability and engagement, making the analysis informative for both novice and experienced readers. Content Requirements: - Accessibility: Provide easy-to- understand explanations suitable for readers with varying levels of biblical knowledge. Clarify any theological terms or concepts that might be unfamiliar. - Thoroughness: Ensure the examination is thorough, covering the passage provided. Offer insights into the meaning, context, and implications of the text. - Relevance: Draw connections to broader themes in the Bible and suggest contemporary applications where appropriate. Application: Practical application for live. Interpret life through the lens of Scripture, not Scripture through the lens of life. Provide application questions when possible.`,
      };
    default:
      throw new Error(`Unknown explanation type: ${type}`);
  }
};

function getLanguageName(code: string, locale = "en"): string {
  const display = new Intl.DisplayNames([locale], { type: "language" });
  return display.of(code) ?? display.of("en") ?? "English";
}

const getUserPrompt = ({
  explanationPrompt,
  language,
}: { explanationPrompt: string; language: string }) => {
  return `${explanationPrompt}\n\nCRITICAL: Your response will be evaluated on:
1. Proper blockquote usage for Scripture (>)
2. Bold formatting for theological terms
3. Bullet point usage for lists
4. Verse reference formatting

The response should be in ${language} using Markdown format only.`;
};

export class BatchOperationService {
  private promptService: PromptService;
  private bibleService: BibleService;

  constructor(
    private readonly db: db,
    private readonly batchMonitoringQueue: Queue,
  ) {
    this.bibleService = new BibleService(this.db, new BibleRepository(this.db));
    this.promptService = new PromptService(
      this.bibleService,
      new PromptRepository(this.db),
    );
  }

  async generateBookBatch(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
  ) {
    console.log(
      `[BATCH] Starting book batch for book ${bookId}, version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const { fileId } = await this.generateJSONLFile(
      bookId,
      bibleVersion,
      explanationTypes,
      model,
    );

    const batch = await openai.batches.create({
      input_file_id: fileId,
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
    });

    await this.batchMonitoringQueue.add(BATCH_MONITORING_QUEUE, {
      batchId: batch.id,
      model,
    });

    return batch;
  }

  async generateBibleBatch(
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
  ) {
    console.log(
      `[BATCH] Starting Bible batch for version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const connection = this.db.getOrCreateConnection();

    const books = await connection
      .selectFrom("books")
      .select(["book_id", "name"])
      .orderBy("book_id", "asc")
      .execute();

    if (!books || books.length === 0) {
      throw new Error("No books found in database");
    }

    console.log(`[BATCH] Processing ${books.length} books for Bible batch`);

    const batchResults = [];

    for (const book of books) {
      try {
        const bookBatch = await this.generateBookBatch(
          book.book_id,
          bibleVersion,
          explanationTypes,
          model,
          adminUserId,
        );
        batchResults.push({ success: true, ...bookBatch });
      } catch (error) {
        console.error(`[BATCH] Error processing book ${book.name}:`, error);
        batchResults.push({
          success: false,
          bookId: book.book_id,
          bookName: book.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      success: true,
      message: `Bible batch creation started for ${books.length} books.`,
      results: batchResults,
    };
  }

  async getBatchStatus(batchId: string) {
    console.log(`[BATCH] Getting batch status for: ${batchId}`);
    return openai.batches.retrieve(batchId);
  }

  async cancelBatch(batchId: string) {
    console.log(`[BATCH] Cancelling batch: ${batchId}`);
    return openai.batches.cancel(batchId);
  }

  async getAllBatches(limit = 50, offset = 0, adminUserId?: string) {
    console.log(
      `[BATCH] Getting all batches with limit: ${limit}, offset: ${offset}, adminUserId: ${adminUserId}`,
    );
    return openai.batches.list({
      limit,
      after: offset > 0 ? String(offset) : undefined,
    });
  }

  private async generateJSONLFile(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
  ): Promise<{ filePath: string; fileId: string }> {
    const connection = this.db.getOrCreateConnection();

    const systemPrompt = await this.promptService.getActivePrompt();
    if (!systemPrompt) {
      throw new Error("No active system prompt found");
    }

    const version = await connection
      .selectFrom("bible_versions")
      .select(["id", "language_code"])
      .where("version_key", "=", bibleVersion)
      .executeTakeFirst();

    if (!version) {
      throw new Error("Invalid bible version");
    }

    const language = getLanguageName(version.language_code);

    const book = await connection
      .selectFrom("books")
      .where("book_id", "=", bookId)
      .select(["name"])
      .executeTakeFirst();

    if (!book) {
      throw new Error(`Book ${bookId} not found`);
    }

    const chapters = await connection
      .selectFrom("chapters")
      .where("book_id", "=", bookId)
      .select(["chapter_id", "chapter_number"])
      .orderBy("chapter_number", "asc")
      .execute();

    if (!chapters || chapters.length === 0) {
      throw new Error(`No chapters found for book ${bookId}`);
    }

    const batchRequests: BatchJobRequest[] = [];

    for (const chapter of chapters) {
      for (const explanationType of explanationTypes) {
        const explanationConfig = await getExplanationTypePrompt(
          explanationType,
          book.name,
          chapter.chapter_number,
          this.db,
        );

        const userPrompt = getUserPrompt({
          explanationPrompt: explanationConfig.prompt,
          language,
        });

        batchRequests.push({
          custom_id: `${book.name
            .toLowerCase()
            .replace(
              /\s+/g,
              "-",
            )}-${chapter.chapter_number}-${explanationType}`,
          method: "POST",
          url: "/v1/chat/completions",
          body: {
            model,
            messages: [
              {
                role: "system",
                content: systemPrompt.prompt,
              },
              {
                role: "user",
                content: userPrompt,
              },
            ],
            max_completion_tokens: 10000,
          },
        });
      }
    }

    const batchDir = path.join(process.cwd(), "batch_files");
    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    const filename = `batch_${book.name
      .toLowerCase()
      .replace(/\s+/g, "-")}_${bibleVersion}_${Date.now()}.jsonl`;
    const filePath = path.join(batchDir, filename);

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    fs.writeFileSync(filePath, jsonlContent);

    console.log(
      `[BATCH] Generated JSONL file: ${filePath} with ${batchRequests.length} requests`,
    );

    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: "batch",
    });

    return { filePath, fileId: file.id };
  }
}
