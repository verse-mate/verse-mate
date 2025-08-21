// packages/backend-base/src/queue/queue.ts
import { Worker } from "bullmq";
import bullmqRedisConnection from "../shared/bullmq-redis";
import { BATCH_MONITORING_QUEUE } from "./batch-monitoring.queue";
import { batchMonitoringConsumer } from "./consumers/batch-monitoring.consumer";

export const batchMonitoringWorker = new Worker(
  BATCH_MONITORING_QUEUE,
  batchMonitoringConsumer,
  {
    connection: bullmqRedisConnection,
    concurrency: 1,
    lockDuration: 60000,
  },
);
