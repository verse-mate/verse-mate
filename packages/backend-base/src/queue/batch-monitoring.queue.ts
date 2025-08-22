// packages/backend-base/src/queue/batch-monitoring.queue.ts
import { Queue } from "bullmq";
import bullmqRedisConnection from "../shared/bullmq-redis";

export const BATCH_MONITORING_QUEUE = "batch-monitoring";

export const batchMonitoringQueue = new Queue(BATCH_MONITORING_QUEUE, {
  connection: bullmqRedisConnection,
});
