import IORedis from "ioredis";
import { redisTlsOptions } from "./redis-tls";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const bullmqRedisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 5000);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: true,
  // DigitalOcean Managed Redis (and most cloud LBs) reap idle TCP
  // sockets after ~5 minutes. BullMQ workers hold long-lived blocking
  // connections (BRPOPLPUSH) that look idle to the LB; without
  // OS-level TCP keepalives, the worker's socket gets closed mid-job
  // and any active job is left stuck in `active` state until manual
  // intervention. Sending a keepalive every 30s keeps the connection
  // healthy.
  keepAlive: 30_000,
  reconnectOnError: (err: Error) => {
    const targetError = "READONLY";
    if ((err as any).message?.includes?.(targetError)) {
      return true;
    }
    return false;
  },
  tls: redisTlsOptions(redisUrl),
});

export default bullmqRedisConnection;
