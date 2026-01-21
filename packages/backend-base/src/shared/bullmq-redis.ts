import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// TLS config for DigitalOcean managed Redis (self-signed certs)
const getTLSConfig = (url: string) => {
  if (url.startsWith("rediss://")) {
    return { rejectUnauthorized: false };
  }
  return undefined;
};

export const bullmqRedisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 100, 5000);
    return delay;
  },
  enableReadyCheck: true,
  lazyConnect: true,
  reconnectOnError: (err: Error) => {
    const targetError = "READONLY";
    if ((err as any).message?.includes?.(targetError)) {
      return true;
    }
    return false;
  },
  tls: getTLSConfig(redisUrl),
});

export default bullmqRedisConnection;
