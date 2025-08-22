// packages/backend-base/src/queue/consumers/batch-monitoring.consumer.ts
import type { Job } from "bullmq";
import { db } from "database";
import OpenAI from "openai";
import { BibleRepository } from "../../bible/repository/bible.repository";
import { BibleService } from "../../bible/services/bible.service";
import {
  BATCH_MONITORING_QUEUE,
  batchMonitoringQueue,
} from "../batch-monitoring.queue";

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

export const batchMonitoringConsumer = async (job: Job) => {
  const { batchId, model } = job.data;

  console.log(`[BATCH_MONITORING] Processing batch ${batchId}`);

  try {
    const batch = await openai.batches.retrieve(batchId);

    console.log(`[BATCH_MONITORING] Batch ${batchId} status: ${batch.status}`);
    console.log(
      "[BATCH_MONITORING] Batch details:",
      JSON.stringify(batch, null, 2),
    );

    // Log any errors if present
    if (batch.errors?.data && batch.errors.data.length > 0) {
      console.error(
        `[BATCH_MONITORING] Batch ${batchId} has errors:`,
        JSON.stringify(batch.errors, null, 2),
      );
    }

    if (batch.status === "completed") {
      console.log(`[BATCH_MONITORING] Batch ${batchId} completed.`);
      const outputFileId = batch.output_file_id;
      if (outputFileId) {
        const fileContent = await openai.files.content(outputFileId);
        const jsonl = await fileContent.text();
        const lines = jsonl.split("\n").filter((line) => line.trim() !== "");

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let successfulExplanations = 0;
        let failedExplanations = 0;

        const batchJob = await db
          .getOrCreateConnection()
          .selectFrom("batch_jobs")
          .where("openai_batch_id", "=", batchId)
          .select(["bible_version", "book_id"])
          .executeTakeFirst();

        if (!batchJob) {
          console.error(
            `[BATCH_MONITORING] Batch job not found for ${batchId}`,
          );
          return;
        }

        for (const line of lines) {
          const parsedLine = JSON.parse(line);

          if (parsedLine.response?.body?.usage) {
            totalPromptTokens += parsedLine.response.body.usage.prompt_tokens;
            totalCompletionTokens +=
              parsedLine.response.body.usage.completion_tokens;
          }

          if (
            parsedLine.custom_id &&
            parsedLine.response?.body?.choices?.[0]?.message?.content
          ) {
            try {
              const customIdParts = parsedLine.custom_id.split("-");
              const explanationType = customIdParts[customIdParts.length - 1];
              const chapterNumber = Number.parseInt(
                customIdParts[customIdParts.length - 2],
              );

              const explanationContent =
                parsedLine.response.body.choices[0].message.content;

              if (!batchJob.book_id || !batchJob.bible_version) {
                console.error(
                  `[BATCH_MONITORING] Missing batch job data for ${batchId}`,
                );
                failedExplanations++;
                continue;
              }

              const chapter = await db
                .getOrCreateConnection()
                .selectFrom("chapters")
                .where("book_id", "=", batchJob.book_id)
                .where("chapter_number", "=", chapterNumber)
                .select("chapter_id")
                .executeTakeFirst();

              if (!chapter) {
                console.error(
                  `[BATCH_MONITORING] Chapter not found: book ${batchJob.book_id}, chapter ${chapterNumber}`,
                );
                failedExplanations++;
                continue;
              }

              await db
                .getOrCreateConnection()
                .insertInto("explanations")
                .values({
                  type: explanationType as any,
                  explanation: explanationContent,
                  chapter_id: chapter.chapter_id,
                  version_id: batchJob.bible_version,
                })
                .onConflict((oc) =>
                  oc.columns(["chapter_id", "type", "version_id"]).doUpdateSet({
                    explanation: explanationContent,
                  }),
                )
                .execute();

              successfulExplanations++;
              console.log(
                `[BATCH_MONITORING] Saved explanation: ${parsedLine.custom_id}`,
              );
            } catch (error) {
              failedExplanations++;
              console.error(
                `[BATCH_MONITORING] Error processing explanation ${parsedLine.custom_id}:`,
                error,
              );
            }
          }
        }

        const actualCost = await calculateActualCost(
          totalPromptTokens,
          totalCompletionTokens,
          model,
        );

        // Determine final status based on success/failure ratio
        let finalStatus = "completed";
        if (successfulExplanations === 0 && failedExplanations > 0) {
          finalStatus = "failed";
        } else if (failedExplanations > 0) {
          finalStatus = "partial_failure";
        }

        console.log(
          `[BATCH_MONITORING] Batch ${batchId} ${finalStatus}: ${successfulExplanations} explanations saved, ${failedExplanations} failed, cost: ${actualCost}`,
        );

        await db
          .getOrCreateConnection()
          .updateTable("batch_jobs")
          .set({
            status: finalStatus,
            actual_cost: actualCost,
            completed_requests: successfulExplanations,
            failed_requests: failedExplanations,
          })
          .where("openai_batch_id", "=", batchId)
          .execute();
      }
    } else if (
      batch.status === "failed" ||
      batch.status === "expired" ||
      batch.status === "cancelled"
    ) {
      console.log(
        `[BATCH_MONITORING] Batch ${batchId} did not complete. Status: ${batch.status}`,
      );
      await db
        .getOrCreateConnection()
        .updateTable("batch_jobs")
        .set({ status: batch.status })
        .where("openai_batch_id", "=", batchId)
        .execute();
    } else {
      console.log(
        `[BATCH_MONITORING] Batch ${batchId} still in progress. Status: ${batch.status}. Re-queuing.`,
      );

      // Update database status if it changed from what we have stored
      const currentBatchJob = await db
        .getOrCreateConnection()
        .selectFrom("batch_jobs")
        .where("openai_batch_id", "=", batchId)
        .select(["status"])
        .executeTakeFirst();

      if (currentBatchJob && currentBatchJob.status !== batch.status) {
        console.log(
          `[BATCH_MONITORING] Updating batch ${batchId} status from ${currentBatchJob.status} to ${batch.status}`,
        );
        await db
          .getOrCreateConnection()
          .updateTable("batch_jobs")
          .set({ status: batch.status as any })
          .where("openai_batch_id", "=", batchId)
          .execute();
      }

      // If validating for more than 10 minutes, log additional debug info
      const timeSinceCreation = Date.now() - batch.created_at * 1000;
      if (batch.status === "validating" && timeSinceCreation > 10 * 60 * 1000) {
        console.warn(
          `[BATCH_MONITORING] Batch ${batchId} has been validating for ${Math.round(timeSinceCreation / 60000)} minutes`,
        );
        console.warn(
          `[BATCH_MONITORING] This may indicate a file format issue. Check input file: ${batch.input_file_id}`,
        );

        // Try to get file info for debugging
        try {
          const fileInfo = await openai.files.retrieve(batch.input_file_id);
          console.warn(
            `[BATCH_MONITORING] Input file status: ${fileInfo.status}, size: ${fileInfo.bytes} bytes`,
          );
        } catch (fileError) {
          console.error(
            "[BATCH_MONITORING] Could not retrieve file info:",
            fileError,
          );
        }
      }

      await batchMonitoringQueue.add(
        BATCH_MONITORING_QUEUE,
        { batchId, model },
        {
          jobId: batchId,
          delay: 5 * 60 * 1000,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      return;
    }
  } catch (error) {
    console.error(
      `[BATCH_MONITORING] Error processing batch ${batchId}:`,
      error,
    );

    const initialDelay = 60 * 1000;
    const maxDelay = 60 * 60 * 1000;
    const maxAttempts = 10;

    const attemptsMade = job.attemptsMade ?? 0;

    if (attemptsMade < maxAttempts) {
      const delay = Math.min(initialDelay * 2 ** attemptsMade, maxDelay);
      console.log(
        `[BATCH_MONITORING] Re-queuing batch ${batchId} with delay of ${delay / 1000} seconds. Attempt ${attemptsMade + 1}/${maxAttempts}`,
      );
      await batchMonitoringQueue.add(
        BATCH_MONITORING_QUEUE,
        { batchId, model },
        {
          jobId: batchId,
          delay,
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      return;
    }
    console.error(
      `[BATCH_MONITORING] Batch ${batchId} failed after ${maxAttempts} attempts. Not re-queuing.`,
    );
    await db
      .getOrCreateConnection()
      .updateTable("batch_jobs")
      .set({ status: "failed" })
      .where("openai_batch_id", "=", batchId)
      .execute();
  }
};
