import * as fs from "node:fs";
import * as path from "node:path";
import type { Queue } from "bullmq";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI from "openai";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
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
  private promptRepository: PromptRepository;

  constructor(
    private readonly db: db,
    private readonly batchMonitoringQueue: Queue,
  ) {
    this.promptRepository = new PromptRepository(this.db);
  }

  async generateBookBatchByName(
    bookName: string,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
    skipExisting = false,
  ) {
    console.log(
      `[BATCH] Starting book batch for book "${bookName}", version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    // Look up book ID by name
    const book = await this.db
      .getOrCreateConnection()
      .selectFrom("books")
      .where("name", "=", bookName)
      .select(["book_id"])
      .executeTakeFirst();

    if (!book) {
      throw new Error(`Book "${bookName}" not found in database`);
    }

    console.log(
      `[BATCH] Found book "${bookName}" with book_id=${book.book_id}`,
    );

    // Call the existing method with the looked-up book_id
    return this.generateBookBatch(
      book.book_id,
      bibleVersion,
      explanationTypes,
      model,
      adminUserId,
      skipExisting,
    );
  }

  async generateBookBatch(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
    skipExisting = false,
  ) {
    console.log(
      `[BATCH] Starting book batch for book ${bookId}, version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const { fileId, filePath, totalRequests } = await this.generateJSONLFile(
      bookId,
      bibleVersion,
      explanationTypes,
      model,
      skipExisting,
    );

    // Add small delay before creating batch to ensure file is fully processed
    console.log(`[BATCH] Waiting before creating batch with file ${fileId}...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const batch = await openai.batches.create({
      input_file_id: fileId,
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
    });

    console.log(
      "[BATCH] Batch created successfully:",
      JSON.stringify(batch, null, 2),
    );

    // Log any initial errors
    if (batch.errors?.data && batch.errors.data.length > 0) {
      console.error(
        `[BATCH] Batch ${batch.id} created with errors:`,
        JSON.stringify(batch.errors, null, 2),
      );
    }

    await this.db
      .getOrCreateConnection()
      .insertInto("batch_jobs")
      .values({
        batch_type: "book",
        openai_batch_id: batch.id,
        status: "validating",
        book_id: bookId,
        bible_version: bibleVersion,
        model,
        explanation_types: explanationTypes,
        total_requests: totalRequests,
        completed_requests: 0,
        failed_requests: 0,
        input_file_path: filePath,
        created_by: adminUserId,
        created_at: new Date(),
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

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
    const batchStatus = await openai.batches.retrieve(batchId);
    console.log(
      `[BATCH] Status response for ${batchId}:`,
      JSON.stringify(batchStatus, null, 2),
    );

    // Log any validation issues
    if (batchStatus.status === "validating") {
      const timeSinceCreation = Date.now() - batchStatus.created_at * 1000;
      console.log(
        `[BATCH] Batch has been validating for ${Math.round(timeSinceCreation / 60000)} minutes`,
      );
    }

    if (batchStatus.status === "failed" && batchStatus.errors) {
      console.error(
        `[BATCH] Batch ${batchId} failed with errors:`,
        JSON.stringify(batchStatus.errors, null, 2),
      );
    }

    // If batch completed but has failed requests, download error file
    if (
      batchStatus.status === "completed" &&
      batchStatus.request_counts &&
      batchStatus.request_counts.failed > 0 &&
      batchStatus.error_file_id
    ) {
      console.error(
        `[BATCH] Batch ${batchId} completed with ${batchStatus.request_counts.failed} failed requests. Downloading error file...`,
      );
      try {
        const errorFileContent = await openai.files.content(
          batchStatus.error_file_id,
        );
        const errorText = await errorFileContent.text();
        console.error(`[BATCH] Error file content for ${batchId}:`);
        console.error(errorText);
      } catch (error) {
        console.error(
          `[BATCH] Could not download error file ${batchStatus.error_file_id}:`,
          error,
        );
      }
    }

    return batchStatus;
  }

  async cancelBatch(batchId: string) {
    console.log(`[BATCH] Cancelling batch: ${batchId}`);
    return openai.batches.cancel(batchId);
  }

  async getAllBatches(limit = 50, offset = 0, adminUserId?: string) {
    console.log(
      `[BATCH] Getting all batches with limit: ${limit}, offset: ${offset}, adminUserId: ${adminUserId}`,
    );

    let query = this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .leftJoin("books", "batch_jobs.book_id", "books.book_id")
      .selectAll("batch_jobs")
      .select("books.name as book_name")
      .orderBy("batch_jobs.created_at", "desc")
      .limit(limit)
      .offset(offset);

    if (adminUserId) {
      query = query.where("batch_jobs.created_by", "=", adminUserId);
    }

    return await query.execute();
  }

  private async generateJSONLFile(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    skipExisting = false,
  ): Promise<{ filePath: string; fileId: string; totalRequests: number }> {
    const connection = this.db.getOrCreateConnection();

    const systemPrompt = await this.promptRepository.getActivePrompt();
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

    console.log(
      `[BATCH] Database query result: bookId=${bookId}, book.name="${book.name}"`,
    );

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

    let existingExplanations: Set<string> = new Set();
    if (skipExisting) {
      const existing = await connection
        .selectFrom("explanations")
        .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
        .where("chapters.book_id", "=", bookId)
        .where("explanations.version_id", "=", version.id)
        .where("explanations.type", "in", explanationTypes)
        .select(["chapters.chapter_number", "explanations.type"])
        .execute();

      existingExplanations = new Set(
        existing.map((e) => `${e.chapter_number}-${e.type}`),
      );

      console.log(
        `[BATCH] Found ${existingExplanations.size} existing explanations to skip`,
      );
    }

    for (const chapter of chapters) {
      for (const explanationType of explanationTypes) {
        const chapterTypeKey = `${chapter.chapter_number}-${explanationType}`;

        if (skipExisting && existingExplanations.has(chapterTypeKey)) {
          console.log(
            `[BATCH] Skipping existing explanation: ${book.name} ${chapter.chapter_number} ${explanationType}`,
          );
          continue;
        }

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

        // Sanitize content to prevent JSONL parsing issues
        const sanitizedSystemPrompt = systemPrompt.prompt
          .replace(/\r\n/g, "\n") // Convert Windows line endings
          .replace(/\r/g, "\n"); // Convert old Mac line endings

        const sanitizedUserPrompt = userPrompt
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

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
                content: sanitizedSystemPrompt,
              },
              {
                role: "user",
                content: sanitizedUserPrompt,
              },
            ],
            max_completion_tokens: 10000,
          },
        });
      }
    }

    // Check if we have any requests to process
    if (batchRequests.length === 0) {
      throw new Error(
        `No requests to process for ${book.name}. All explanations may already exist.`,
      );
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

    // Log first request for debugging
    if (batchRequests.length > 0) {
      console.log(
        "[BATCH] Sample JSONL request:",
        JSON.stringify(batchRequests[0], null, 2),
      );

      // Check line length - this might be the issue!
      const firstLine = JSON.stringify(batchRequests[0]);
      console.log(`[BATCH] First line length: ${firstLine.length} characters`);
      if (firstLine.length > 10000) {
        console.warn(
          `[BATCH] WARNING: Line length (${firstLine.length}) may be too long for OpenAI batch processing!`,
        );
      }
    }

    // Validate JSONL format by parsing each line
    const lines = jsonlContent.split("\n");
    let validLines = 0;
    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]);
        validLines++;

        // Additional validation checks
        if (
          !parsed.custom_id ||
          !parsed.method ||
          !parsed.url ||
          !parsed.body
        ) {
          console.error(
            `[BATCH] Line ${i + 1} missing required fields:`,
            Object.keys(parsed),
          );
        }
        if (parsed.body && (!parsed.body.model || !parsed.body.messages)) {
          console.error(
            `[BATCH] Line ${i + 1} body missing required fields:`,
            Object.keys(parsed.body),
          );
        }
      } catch (error) {
        console.error(
          `[BATCH] Invalid JSON at line ${i + 1}:`,
          `${lines[i].substring(0, 200)}...`,
        );
        console.error("[BATCH] Parse error:", error);
      }
    }
    console.log(
      `[BATCH] JSONL validation: ${validLines}/${lines.length} lines valid`,
    );

    // Log file size and content info
    const stats = fs.statSync(filePath);
    console.log(
      `[BATCH] File size: ${stats.size} bytes, ${lines.length} lines, avg line length: ${Math.round(jsonlContent.length / lines.length)} chars`,
    );

    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: "batch",
    });

    console.log(
      `[BATCH] File uploaded successfully: ${file.id}, status: ${file.status}, bytes: ${file.bytes}`,
    );

    // Wait a moment and verify file is processed
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const fileCheck = await openai.files.retrieve(file.id);
    console.log(
      `[BATCH] File verification: ${fileCheck.id}, status: ${fileCheck.status}, bytes: ${fileCheck.bytes}`,
    );

    if (fileCheck.status === "error") {
      throw new Error(
        `File upload failed with error status: ${JSON.stringify(fileCheck)}`,
      );
    }

    return { filePath, fileId: file.id, totalRequests: batchRequests.length };
  }
}
