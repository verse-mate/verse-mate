import IORedis from "ioredis";
import { redisTlsOptions } from "./redis-tls";
import { configuredRedisUrl } from "./redis-url";

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

export const bullmqRedisConnection = createBullmqRedisConnection(
  configuredRedisUrl(),
);

export default bullmqRedisConnection;
