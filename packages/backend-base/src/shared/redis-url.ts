export const DEFAULT_REDIS_URL = "redis://:abcd1234@localhost:6379/0";

export function configuredRedisUrl(): string {
  return process.env.REDIS_URL ?? DEFAULT_REDIS_URL;
}
