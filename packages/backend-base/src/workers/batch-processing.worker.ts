import { Worker } from "bullmq";
import { db } from "database";
import { BatchOperationService } from "../admin/services/batch-operations.service";
import { batchMonitoringQueue } from "../queue/batch-monitoring.queue";
import {
  BATCH_PROCESSING_QUEUE,
  batchProcessingQueue,
} from "../queue/batch-processing.queue";

const worker = new Worker(
  BATCH_PROCESSING_QUEUE,
  async (job) => {
    const { batchId, outputFileId } = job.data;
    console.log(`[WORKER] Processing batch ${batchId}`);

    const batchOperationService = new BatchOperationService(
      db,
      batchMonitoringQueue,
      batchProcessingQueue,
    );

    await batchOperationService.processBatch(batchId, outputFileId);
  },
  { connection: batchProcessingQueue.opts.connection },
);

worker.on("completed", (job) => {
  if (job) {
    console.log(`[WORKER] Job ${job.id} has completed`);
  }
});

worker.on("failed", (job, err) => {
  if (job) {
    console.log(`[WORKER] Job ${job.id} has failed with ${err.message}`);
  } else {
    console.log(`[WORKER] An unknown job has failed with ${err.message}`);
  }
});

console.log("Batch processing worker started.");

export const batchProcessingWorker = worker;
