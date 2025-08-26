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
  url: "/v1/responses";
  body: {
    model: string;
    reasoning: { effort: "low" | "medium" | "high" };
    instructions?: string;
    input: string;
    max_output_tokens: number;
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_KEY,
});

async function calculateActualCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): Promise<number> {
  let inputCostPerMillion = 0;
  let outputCostPerMillion = 0;

  switch (model) {
    case "gpt-5":
    case "gpt-5-chat-latest":
      inputCostPerMillion = 1.25;
      outputCostPerMillion = 10;
      break;
    case "gpt-5-mini":
      inputCostPerMillion = 0.25;
      outputCostPerMillion = 2;
      break;
    case "gpt-5-nano":
      inputCostPerMillion = 0.05;
      outputCostPerMillion = 0.4;
      break;
    default:
      inputCostPerMillion = 1.25;
      outputCostPerMillion = 10;
      break;
  }

  const inputCost = (promptTokens / 1_000_000) * inputCostPerMillion;
  const outputCost = (completionTokens / 1_000_000) * outputCostPerMillion;

  const totalCost = inputCost + outputCost;
  const batchDiscount = 0.5;

  return totalCost * batchDiscount;
}

import { getExplanationTypePrompt } from "../../shared/prompt-utils";

function getLanguageName(code: string, locale = "en"): string {
  const display = new Intl.DisplayNames([locale], { type: "language" });
  return display.of(code) ?? display.of("en") ?? "English";
}

const getUserPrompt = ({
  explanationPrompt,
  language,
}: { explanationPrompt: string; language: string }) => {
  return `${explanationPrompt}

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
    effort: "low" | "medium" | "high" = "medium",
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
      effort,
    );
  }

  async generateBookBatch(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    adminUserId: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
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
      effort,
    );

    // Add small delay before creating batch to ensure file is fully processed
    console.log(`[BATCH] Waiting before creating batch with file ${fileId}...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const batch = await openai.batches.create({
      input_file_id: fileId,
      endpoint: "/v1/responses",
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
    effort: "low" | "medium" | "high" = "medium",
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
          false,
          effort,
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
      // Clean up JSONL file for failed batches
      await this.cleanupBatchFiles(batchId);
    }

    // Clean up JSONL files for expired or cancelled batches
    if (
      batchStatus.status === "expired" ||
      batchStatus.status === "cancelled"
    ) {
      await this.cleanupBatchFiles(batchId);
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

    // Get current batch job info from database
    const currentBatchJob = await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("openai_batch_id", "=", batchId)
      .select([
        "status",
        "completed_requests",
        "failed_requests",
        "explanations_processed",
      ])
      .executeTakeFirst();

    // Use OpenAI's batch status and request counts as the authoritative source of truth
    if (currentBatchJob && batchStatus.request_counts) {
      const { total, completed, failed } = batchStatus.request_counts;

      // Determine correct status based on OpenAI's batch status and request counts
      let correctStatus: string = batchStatus.status; // Use OpenAI's status as primary

      // Only override if batch is completed but has specific success/failure patterns
      if (batchStatus.status === "completed") {
        if (completed === 0 && failed > 0) {
          correctStatus = "failed";
        } else if (failed > 0) {
          correctStatus = "partial_failure";
        }
        // If completed > 0 and failed === 0, keep as "completed"
      }

      // Update if status or counts are different
      if (
        currentBatchJob.status !== correctStatus ||
        currentBatchJob.completed_requests !== completed ||
        currentBatchJob.failed_requests !== failed
      ) {
        console.log(
          `[BATCH] Updating batch ${batchId} status to ${correctStatus} (${completed} completed, ${failed} failed out of ${total} total)`,
        );

        await this.db
          .getOrCreateConnection()
          .updateTable("batch_jobs")
          .set({
            status: correctStatus,
            completed_requests: completed,
            failed_requests: failed,
          })
          .where("openai_batch_id", "=", batchId)
          .execute();

        // Clean up JSONL file for permanently failed batches
        if (correctStatus === "failed") {
          await this.cleanupBatchFiles(batchId);
        }
      }

      // Process explanations for completed batches that need processing
      if (
        (correctStatus === "completed" ||
          correctStatus === "partial_failure") &&
        batchStatus.output_file_id
      ) {
        console.log(
          `[BATCH] Checking if batch ${batchId} needs explanation processing:`,
        );
        console.log(`  - Status: ${correctStatus}`);
        console.log(`  - OpenAI completed: ${completed}, failed: ${failed}`);
        console.log(
          `  - DB completed: ${currentBatchJob.completed_requests}, failed: ${currentBatchJob.failed_requests}`,
        );
        console.log(
          `  - Explanations processed flag: ${currentBatchJob.explanations_processed}`,
        );
        console.log(`  - Output file: ${batchStatus.output_file_id}`);

        // Simple logic: if batch is completed with successes and not marked as processed, process it
        const needsProcessing =
          (correctStatus === "completed" ||
            correctStatus === "partial_failure") &&
          completed > 0 &&
          !currentBatchJob.explanations_processed;

        console.log(`  - Needs processing: ${needsProcessing}`);

        if (needsProcessing) {
          console.log(
            `[BATCH] Processing explanations for batch ${batchId} (${completed} successful responses)`,
          );
          await this.processOutputFile(batchId, batchStatus.output_file_id);
        } else {
          console.log(
            `[BATCH] Batch ${batchId} explanations already processed, skipping`,
          );
        }
      } else {
        console.log(
          `[BATCH] Batch ${batchId} not ready for explanation processing: status=${correctStatus}, output_file=${batchStatus.output_file_id}`,
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
    effort: "low" | "medium" | "high" = "medium",
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
          language,
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
          url: "/v1/responses",
          body: {
            model,
            reasoning: { effort },
            instructions: sanitizedSystemPrompt,
            input: sanitizedUserPrompt,
            max_output_tokens: 25000,
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

    const batchDir = "/tmp";
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
        if (parsed.body && (!parsed.body.model || !parsed.body.input)) {
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

  private async cleanupBatchFiles(batchId: string): Promise<void> {
    try {
      // Get the batch job to find the input file path
      const batchJob = await this.db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .select("input_file_path")
        .executeTakeFirst();

      if (
        batchJob?.input_file_path &&
        fs.existsSync(batchJob.input_file_path)
      ) {
        fs.unlinkSync(batchJob.input_file_path);
        console.log(
          `[BATCH] Cleaned up JSONL file: ${batchJob.input_file_path}`,
        );
      }
    } catch (error) {
      console.error(
        `[BATCH] Error cleaning up files for batch ${batchId}:`,
        error,
      );
    }
  }

  private async processOutputFile(batchId: string, outputFileId: string) {
    try {
      // Get batch job info
      const batchJob = await this.db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .select(["bible_version", "book_id", "model"])
        .executeTakeFirst();

      if (!batchJob) {
        console.error(`[BATCH] Batch job not found for ${batchId}`);
        return;
      }

      // Get the actual version_id (UUID) for the bible version
      const version = await this.db
        .getOrCreateConnection()
        .selectFrom("bible_versions")
        .where("version_key", "=", batchJob.bible_version)
        .select("id")
        .executeTakeFirst();

      if (!version) {
        console.error(
          `[BATCH] Bible version not found: ${batchJob.bible_version}`,
        );
        return;
      }

      // Download and process output file
      const fileContent = await openai.files.content(outputFileId);
      const jsonl = await fileContent.text();
      const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

      let processedCount = 0;
      let errorCount = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      for (const line of lines) {
        try {
          const parsedLine = JSON.parse(line);

          // Track token usage for cost calculation
          if (parsedLine.response?.body?.usage) {
            totalPromptTokens +=
              parsedLine.response.body.usage.input_tokens || 0;
            totalCompletionTokens +=
              parsedLine.response.body.usage.output_tokens || 0;
          }

          // Check if the response is successful and has content
          const responseBody = parsedLine.response?.body;

          // Determine if response has content and extract it robustly
          const outputText: string | undefined = responseBody?.output_text;
          let extractedText: string | undefined = outputText;

          if (!extractedText && Array.isArray(responseBody?.output)) {
            // Find the first text segment across all items
            for (const item of responseBody.output) {
              const textCandidate = item?.content?.find?.(
                (c: any) => typeof c?.text === "string",
              )?.text;
              if (textCandidate) {
                extractedText = textCandidate;
                break;
              }
            }
          }

          if (
            parsedLine.custom_id &&
            parsedLine.response?.status_code === 200 &&
            typeof extractedText === "string" &&
            extractedText.length > 0
          ) {
            // Parse custom_id to extract chapter and explanation type
            const customIdParts = parsedLine.custom_id.split("-");
            const explanationType = customIdParts[customIdParts.length - 1];
            const chapterNumber = Number.parseInt(
              customIdParts[customIdParts.length - 2],
            );

            const explanationContent = extractedText;

            // Get chapter_id
            const chapter = await this.db
              .getOrCreateConnection()
              .selectFrom("chapters")
              .where("book_id", "=", batchJob.book_id)
              .where("chapter_number", "=", chapterNumber)
              .select("chapter_id")
              .executeTakeFirst();

            if (!chapter) {
              console.error(
                `[BATCH] Chapter not found: book ${batchJob.book_id}, chapter ${chapterNumber}`,
              );
              errorCount++;
              continue;
            }

            // Insert/update explanation
            await this.db
              .getOrCreateConnection()
              .insertInto("explanations")
              .values({
                type: explanationType as any,
                explanation: explanationContent,
                chapter_id: chapter.chapter_id,
                version_id: version.id,
              })
              .onConflict((oc) =>
                oc.columns(["chapter_id", "type", "version_id"]).doUpdateSet({
                  explanation: explanationContent,
                }),
              )
              .execute();

            processedCount++;
            console.log(`[BATCH] Saved explanation: ${parsedLine.custom_id}`);
          } else {
            // Log detailed reason for skipping
            const customId = parsedLine.custom_id || "UNKNOWN";
            const statusCode = parsedLine.response?.status_code || "NO_STATUS";
            const hasContent = !!(
              parsedLine.response?.body?.output_text ||
              (parsedLine.response?.body?.output &&
                parsedLine.response.body.output.length > 1 &&
                parsedLine.response.body.output[1]?.content &&
                parsedLine.response.body.output[1].content.length > 0 &&
                parsedLine.response.body.output[1].content[0]?.text)
            );
            const error = parsedLine.response?.body?.error || null;

            console.warn(
              `[BATCH] Skipping failed response for ${customId}: status=${statusCode}, hasContent=${hasContent}`,
            );

            if (error) {
              console.warn("[BATCH] Error details:", error);
            }

            if (parsedLine.response?.body && !hasContent) {
              console.warn(
                "[BATCH] Response body:",
                JSON.stringify(parsedLine.response.body, null, 2),
              );
            }

            errorCount++;
          }
        } catch (error) {
          errorCount++;
          console.error("[BATCH] Error processing explanation line:", error);
        }
      }

      // Calculate total cost
      const actualCost = await calculateActualCost(
        totalPromptTokens,
        totalCompletionTokens,
        batchJob.model,
      );

      console.log(
        `[BATCH] Processed output file for batch ${batchId}: ${processedCount} explanations saved, ${errorCount} errors`,
      );
      console.log(
        `[BATCH] Token usage: ${totalPromptTokens} prompt + ${totalCompletionTokens} completion = ${totalPromptTokens + totalCompletionTokens} total`,
      );
      console.log(`[BATCH] Calculated cost: $${actualCost.toFixed(4)}`);

      // Mark batch as having explanations processed and update cost
      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({
          explanations_processed: true,
          actual_cost: actualCost,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalPromptTokens + totalCompletionTokens,
        })
        .where("openai_batch_id", "=", batchId)
        .execute();

      console.log(
        `[BATCH] Marked batch ${batchId} as explanations processed with cost $${actualCost.toFixed(4)}`,
      );

      // Clean up JSONL file after successful processing
      await this.cleanupBatchFiles(batchId);
    } catch (error) {
      console.error(
        `[BATCH] Error processing output file for batch ${batchId}:`,
        error,
      );
    }
  }
}
