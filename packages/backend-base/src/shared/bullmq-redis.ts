import IORedis from "ioredis";
import { redisTlsOptions } from "./redis-tls";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export function createBullmqRedisConnection(url: string) {
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 100, 5000);
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: true,
    keepAlive: 30_000,
    reconnectOnError: (err: Error) => {
      const targetError = "READONLY";
      if ((err as any).message?.includes?.(targetError)) {
        return true;
      }
      return false;
    },
    tls: redisTlsOptions(url),
  });
}

export const bullmqRedisConnection = createBullmqRedisConnection(redisUrl);

export default bullmqRedisConnection;
