// packages/backend-base/src/queue/batch-processing.queue.ts
import { Queue } from "bullmq";
import bullmqRedisConnection from "../shared/bullmq-redis";

export const BATCH_PROCESSING_QUEUE = "batch-processing";

export const batchProcessingQueue = new Queue(BATCH_PROCESSING_QUEUE, {
  connection: bullmqRedisConnection,
});
