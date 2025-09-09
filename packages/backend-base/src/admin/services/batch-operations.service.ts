import { Readable } from "node:stream";
import type { Queue } from "bullmq";
import type ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import OpenAI, { APIError } from "openai";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { PromptRepository } from "../../bible/repository/prompt.repository";
import { UserPromptRepository } from "../../bible/repository/user-prompt.repository";
import { BATCH_MONITORING_QUEUE } from "../../queue/batch-monitoring.queue";
import {
  BATCH_PROCESSING_QUEUE,
  batchProcessingQueue,
} from "../../queue/batch-processing.queue";
import { getExplanationTypePrompt } from "../../shared/prompt-utils";
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

function getLanguageName(code: string, locale = "en"): string {
  const display = new Intl.DisplayNames([locale], { type: "language" });
  return display.of(code) ?? display.of("en") ?? "English";
}

const getUserPrompt = ({
  explanationPrompt,
  language,
}: { explanationPrompt: string; language: string }) => {
  return `${explanationPrompt}\n\nThe response should be in ${language} using Markdown format only.`;
};

export class BatchOperationService {
  private promptRepository: PromptRepository;

  constructor(
    private readonly db: db,
    private readonly batchMonitoringQueue: Queue,
    private readonly batchProcessingQueue: Queue,
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
    parentBatchId?: number,
  ) {
    console.log(
      `[BATCH] Starting book batch for book ${bookId}, version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const { jsonlContent, totalRequests } = await this.generateJSONLContent(
      bookId,
      bibleVersion,
      explanationTypes,
      model,
      skipExisting,
      effort,
    );

    const blob = new Blob([jsonlContent], { type: "application/jsonl" });
    const file = await openai.files.create({
      file: new File(
        [blob],
        `batch_${bookId}_${bibleVersion}_${Date.now()}.jsonl`,
      ),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    console.log(
      "[BATCH] Batch created successfully:",
      JSON.stringify(batch, null, 2),
    );

    if (batch.errors?.data && batch.errors.data.length > 0) {
      console.error(
        `[BATCH] Batch ${batch.id} created with errors`,
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
        created_by: adminUserId,
        created_at: new Date(),
        parent_batch_id: parentBatchId === undefined ? null : parentBatchId,
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
    skipExisting = false,
  ) {
    console.log(
      `[BATCH] Starting Bible batch for version ${bibleVersion}, types: ${explanationTypes.join(
        ", ",
      )}`,
    );

    const connection = this.db.getOrCreateConnection();

    const parentBatch = await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "bible",
        status: "in_progress",
        bible_version: bibleVersion,
        model,
        explanation_types: explanationTypes,
        created_by: adminUserId,
        total_requests: 66,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const parentBatchId = parentBatch.id;

    const books = await connection
      .selectFrom("books")
      .select(["book_id", "name"])
      .orderBy("book_id", "asc")
      .execute();

    if (!books || books.length === 0) {
      throw new Error("No books found in database");
    }

    console.log(
      `[BATCH] Processing ${books.length} books for Bible batch (Parent ID: ${parentBatchId})`,
    );

    const batchResults = [];

    for (const book of books) {
      try {
        const bookBatch = await this.generateBookBatch(
          book.book_id,
          bibleVersion,
          explanationTypes,
          model,
          adminUserId,
          skipExisting,
          effort,
          parentBatchId,
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
      message: `Bible batch creation started for ${books.length} books under parent batch ${parentBatchId}.`,
      results: batchResults,
      parentBatchId: parentBatchId,
    };
  }

  async generateRephraseBatch(
    model: string,
    adminUserId: string,
    effort: "low" | "medium" | "high" = "medium",
  ) {
    console.log(`[BATCH] Starting rephrase batch with model ${model}`);

    const connection = this.db.getOrCreateConnection();
    const activeExplanations = await connection
      .selectFrom("explanations")
      .where("is_active", "=", true)
      .selectAll()
      .execute();

    if (activeExplanations.length === 0) {
      throw new Error("No active explanations found to rephrase.");
    }

    const batchRequests: BatchJobRequest[] = activeExplanations.map(
      (explanation) => ({
        custom_id: `rephrase-${explanation.explanation_id}`,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          reasoning: { effort },
          instructions: "Rephrase the following text:", // Placeholder
          input: explanation.explanation,
          max_output_tokens: 25000,
        },
      }),
    );

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    const blob = new Blob([jsonlContent], { type: "application/jsonl" });
    const file = await openai.files.create({
      file: new File([blob], `rephrase_batch_${Date.now()}.jsonl`),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    await connection
      .insertInto("batch_jobs")
      .values({
        batch_type: "rephrase",
        openai_batch_id: batch.id,
        status: "validating",
        model,
        total_requests: batchRequests.length,
        created_by: adminUserId,
        bible_version: "N/A",
        explanation_types: [],
      })
      .execute();

    await this.batchMonitoringQueue.add(
      BATCH_MONITORING_QUEUE,
      { batchId: batch.id, model },
      { jobId: batch.id, removeOnComplete: true, removeOnFail: 100 },
    );

    return batch;
  }

  async getBatchStatus(batchId: string) {
    const batchStatus = await openai.batches.retrieve(batchId);

    if (batchStatus.status === "failed" && batchStatus.errors) {
      console.error(
        `[BATCH] Batch ${batchId} failed with errors`,
        JSON.stringify(batchStatus.errors, null, 2),
      );
    }

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

    if (currentBatchJob && batchStatus.request_counts) {
      const { total, completed, failed } = batchStatus.request_counts;

      let correctStatus: string = batchStatus.status;

      if (batchStatus.status === "completed") {
        if (completed === 0 && failed > 0) {
          correctStatus = "failed";
        } else if (failed > 0) {
          correctStatus = "partial_failure";
        }
      }

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
      }

      const needsProcessing =
        (correctStatus === "completed" ||
          correctStatus === "partial_failure") &&
        completed > 0 &&
        !currentBatchJob.explanations_processed;

      if (needsProcessing) {
        console.log(
          `[BATCH] Batch ${batchId} is complete and needs processing. Adding to queue.`,
        );
        await this.batchProcessingQueue.add("process-batch", {
          batchId,
          outputFileId: batchStatus.output_file_id,
        });
      }
    }

    return batchStatus;
  }

  async processBatch(batchId: string, outputFileId: string) {
    console.log(`[BATCH] Processing batch ${batchId} from queue.`);

    const batchStatus = await openai.batches.retrieve(batchId);

    if (
      batchStatus.request_counts &&
      batchStatus.request_counts.failed > 0 &&
      batchStatus.error_file_id
    ) {
      try {
        const errorFileContent = await openai.files.content(
          batchStatus.error_file_id,
        );
        const errorText = await errorFileContent.text();
        await this.db
          .getOrCreateConnection()
          .updateTable("batch_jobs")
          .set({ error_file_content: errorText })
          .where("openai_batch_id", "=", batchId)
          .execute();
      } catch (error) {
        console.error(
          `[BATCH] Could not download error file ${batchStatus.error_file_id}:`,
          error,
        );
      }
    }

    await this.processOutputFile(batchId, outputFileId);
  }

  async cancelBatch(batchId: string) {
    console.log(`[BATCH] Cancelling batch: ${batchId}`);

    const batchJob = await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("id", "=", Number(batchId))
      .select(["batch_type", "openai_batch_id", "status"])
      .executeTakeFirst();

    if (!batchJob) {
      throw new Error(`Batch job ${batchId} not found.`);
    }

    if (batchJob.batch_type === "bible") {
      console.log(
        `[BATCH] Cancelling parent Bible batch ${batchId} and its children.`,
      );
      const children = await this.getBatchChildren(Number(batchId));
      let cancelledCount = 0;
      let failedToCancelCount = 0;

      for (const child of children) {
        if (
          child.openai_batch_id &&
          (child.status === "validating" ||
            child.status === "in_progress" ||
            child.status === "finalizing")
        ) {
          try {
            const openaiBatch = await openai.batches.cancel(
              child.openai_batch_id,
            );
            console.log(
              `[BATCH] Successfully sent cancel request for child batch ${child.openai_batch_id}`,
            );
            // Update child status in DB based on OpenAI API response
            await this.db
              .getOrCreateConnection()
              .updateTable("batch_jobs")
              .set({ status: openaiBatch.status }) // Use the status from OpenAI API response
              .where("id", "=", Number(child.id))
              .execute();
            cancelledCount++;
          } catch (error) {
            if (
              error instanceof APIError &&
              error.status === 409 &&
              error.message.includes(
                "Cannot cancel a batch with status 'completed'",
              )
            ) {
              console.warn(
                `[BATCH] Child batch ${child.openai_batch_id} was already completed and could not be cancelled.`,
              );
              // Mark child as failed_to_cancel if it was already completed and couldn't be cancelled
              await this.db
                .getOrCreateConnection()
                .updateTable("batch_jobs")
                .set({ status: "failed_to_cancel" })
                .where("id", "=", Number(child.id))
                .execute();
            } else {
              console.error(
                `[BATCH] Failed to cancel child batch ${child.openai_batch_id}:`,
                error,
              );
              // Mark child as failed_to_cancel to make UI accurate
              await this.db
                .getOrCreateConnection()
                .updateTable("batch_jobs")
                .set({ status: "failed_to_cancel" })
                .where("id", "=", Number(child.id))
                .execute();
            }
            failedToCancelCount++;
          }
        }
      }

      // Re-fetch children statuses to accurately determine parent status
      const updatedChildren = await this.getBatchChildren(Number(batchId));
      let newCancelledCount = 0;
      let newFailedToCancelCount = 0;
      let newCompletedCount = 0;

      for (const child of updatedChildren) {
        if (child.status === "cancelled") {
          newCancelledCount++;
        } else if (child.status === "failed_to_cancel") {
          newFailedToCancelCount++;
        } else if (child.status === "completed") {
          newCompletedCount++;
        }
      }

      let newParentStatus = "cancelled";
      if (newCancelledCount === 0 && newFailedToCancelCount > 0) {
        newParentStatus = "failed_to_cancel";
      } else if (newFailedToCancelCount > 0) {
        newParentStatus = "partially_cancelled";
      } else if (newCancelledCount > 0) {
        newParentStatus = "cancelled";
      } else if (newCompletedCount === updatedChildren.length) {
        newParentStatus = "completed"; // All children completed, parent is completed
      } else {
        newParentStatus = batchJob.status; // Fallback to original status if no change
      }

      await this.db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({ status: newParentStatus })
        .where("id", "=", Number(batchId))
        .execute();

      return {
        success: true,
        message: `Cancellation process initiated for ${newCancelledCount} child batches.`,
      };
    }

    if (!batchJob.openai_batch_id) {
      throw new Error(
        `Book batch ${batchId} does not have an OpenAI batch ID.`,
      );
    }
    const openaiBatch = await openai.batches.cancel(batchJob.openai_batch_id);
    console.log(
      `[BATCH] Successfully cancelled single book batch ${batchJob.openai_batch_id}`,
    );
    return openaiBatch;
  }

  async getAllBatches(limit = 50, offset = 0, adminUserId?: string) {
    console.log(
      `[BATCH] Getting all batches with limit: ${limit}, offset: ${offset}, adminUserId: ${adminUserId}`,
    );

    let query = this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("parent_batch_id", "is", null)
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

  async getBatchChildren(parentBatchId: number) {
    console.log(`[BATCH] Getting children for parent batch: ${parentBatchId}`);
    return await this.db
      .getOrCreateConnection()
      .selectFrom("batch_jobs")
      .where("parent_batch_id", "=", parentBatchId)
      .leftJoin("books", "batch_jobs.book_id", "books.book_id")
      .selectAll("batch_jobs")
      .select("books.name as book_name")
      .orderBy("batch_jobs.book_id", "asc")
      .execute();
  }

  async monitorBibleBatch(parentBatchId: number) {
    console.log(`[BATCH] Monitoring bible batch: ${parentBatchId}`);
    const children = await this.getBatchChildren(parentBatchId);
    const childBatchesToMonitor = children
      .map((c) => c.openai_batch_id)
      .filter((id): id is string => !!id);

    const concurrencyLimit = 6;
    const results = [];

    for (let i = 0; i < childBatchesToMonitor.length; i += concurrencyLimit) {
      const batch = childBatchesToMonitor.slice(i, i + concurrencyLimit);
      const promises = batch.map((id) => this.getBatchStatus(id));
      results.push(...(await Promise.all(promises)));
    }

    return { success: true, message: "Monitoring complete." };
  }

  async getBatchSummary(parentBatchId: number) {
    console.log(`[BATCH] Getting summary for parent batch: ${parentBatchId}`);
    const children = await this.getBatchChildren(parentBatchId);
    const totalChildren = children.length;

    if (totalChildren === 0) {
      return {
        aggregate_status: "empty",
        status_progress_text: "No books found for this batch.",
        total_cost: 0,
      };
    }

    const statusCounts = children.reduce(
      (acc, child) => {
        acc[child.status] = (acc[child.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const totalCost = children.reduce(
      (acc, child) => acc + (child.actual_cost || 0),
      0,
    );

    const failedCount = statusCounts.failed || 0;
    const cancelledCount = statusCounts.cancelled || 0;
    const expiredCount = statusCounts.expired || 0;
    const partialFailureCount = statusCounts.partial_failure || 0;

    if (
      failedCount > 0 ||
      cancelledCount > 0 ||
      expiredCount > 0 ||
      partialFailureCount > 0
    ) {
      return {
        aggregate_status: "partial_failure",
        status_progress_text: `Failed (${failedCount + cancelledCount + expiredCount + partialFailureCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    const completedCount = statusCounts.completed || 0;

    if (statusCounts.validating > 0) {
      const validatedCount = totalChildren - (statusCounts.validating || 0);
      return {
        aggregate_status: "validating",
        status_progress_text: `Validating (${validatedCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    if (statusCounts.in_progress > 0) {
      const inProgressCount =
        totalChildren -
        (statusCounts.in_progress || 0) -
        (statusCounts.validating || 0);
      return {
        aggregate_status: "in_progress",
        status_progress_text: `In Progress (${inProgressCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    if (statusCounts.finalizing > 0) {
      return {
        aggregate_status: "finalizing",
        status_progress_text: `Finalizing (${completedCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    if (completedCount === totalChildren) {
      return {
        aggregate_status: "completed",
        status_progress_text: `Completed (${completedCount}/${totalChildren})`,
        total_cost: totalCost,
      };
    }

    return {
      aggregate_status: "pending",
      status_progress_text: "Pending...",
      total_cost: totalCost,
    };
  }

  private async generateJSONLContent(
    bookId: number,
    bibleVersion: string,
    explanationTypes: ExplanationTypeEnum[],
    model: string,
    skipExisting = false,
    effort: "low" | "medium" | "high" = "medium",
  ): Promise<{ jsonlContent: string; totalRequests: number }> {
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

        const sanitizedSystemPrompt = systemPrompt.prompt
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");

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

    if (batchRequests.length === 0) {
      throw new Error(
        `No requests to process for ${book.name}. All explanations may already exist.`,
      );
    }

    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join("\n");

    return { jsonlContent, totalRequests: batchRequests.length };
  }

  private async processOutputFile(batchId: string, outputFileId: string) {
    try {
      const batchJob = await this.db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .select(["batch_type", "bible_version", "book_id", "model"])
        .executeTakeFirst();

      if (!batchJob) {
        console.error(`[BATCH] Batch job not found for ${batchId}`);
        return;
      }

      if (batchJob.batch_type === "rephrase") {
        return this.processRephraseOutputFile(batchId, outputFileId, batchJob);
      }

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

          if (parsedLine.response?.body?.usage) {
            totalPromptTokens +=
              parsedLine.response.body.usage.input_tokens || 0;
            totalCompletionTokens +=
              parsedLine.response.body.usage.output_tokens || 0;
          }

          const responseBody = parsedLine.response?.body;

          const outputText: string | undefined = responseBody?.output_text;
          let extractedText: string | undefined = outputText;

          if (!extractedText && Array.isArray(responseBody?.output)) {
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
            const customIdParts = parsedLine.custom_id.split("-");
            const explanationType = customIdParts[customIdParts.length - 1];
            const chapterNumber = Number.parseInt(
              customIdParts[customIdParts.length - 2],
            );

            const explanationContent = extractedText;

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
    } catch (error) {
      console.error(
        `[BATCH] Error processing output file for batch ${batchId}`,
        error,
      );
    }
  }

  private async processRephraseOutputFile(
    batchId: string,
    outputFileId: string,
    batchJob: { model: string },
  ) {
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

        if (parsedLine.response?.body?.usage) {
          totalPromptTokens += parsedLine.response.body.usage.input_tokens || 0;
          totalCompletionTokens +=
            parsedLine.response.body.usage.output_tokens || 0;
        }

        const responseBody = parsedLine.response?.body;
        const extractedText: string | undefined =
          responseBody?.output_text ||
          responseBody?.output?.[1]?.content?.[0]?.text;

        if (
          parsedLine.custom_id?.startsWith("rephrase-") &&
          parsedLine.response?.status_code === 200 &&
          typeof extractedText === "string" &&
          extractedText.length > 0
        ) {
          const originalExplanationId = Number.parseInt(
            parsedLine.custom_id.replace("rephrase-", ""),
          );
          const originalExplanation = await this.db
            .getOrCreateConnection()
            .selectFrom("explanations")
            .where("explanation_id", "=", originalExplanationId)
            .selectAll()
            .executeTakeFirst();

          if (originalExplanation) {
            await this.db
              .getOrCreateConnection()
              .transaction()
              .execute(async (trx) => {
                await trx
                  .updateTable("explanations")
                  .set({ is_active: false })
                  .where("explanation_id", "=", originalExplanationId)
                  .execute();

                await trx
                  .insertInto("explanations")
                  .values({
                    ...originalExplanation,
                    explanation: extractedText,
                    is_active: true,
                    version: originalExplanation.version + 1,
                    parent_explanation_id: originalExplanationId,
                    created_at: new Date(),
                  })
                  .execute();
              });
            processedCount++;
          }
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        console.error("[BATCH] Error processing rephrase line:", error);
      }
    }

    const actualCost = await calculateActualCost(
      totalPromptTokens,
      totalCompletionTokens,
      batchJob.model,
    );

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
      `[BATCH] Rephrase batch ${batchId} processed: ${processedCount} saved, ${errorCount} errors. Cost: ${actualCost.toFixed(4)}`,
    );
  }
}
