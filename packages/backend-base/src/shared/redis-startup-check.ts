export const UNREADABLE_REDIS_HOST = "<unreadable REDIS_URL>";

export interface RedisStartupCheck {
  cache: { connect(): Promise<unknown> };
  queue: { ping(): Promise<unknown> };
  redisUrl: string;
  timeoutMs: number;
  exit: (code: number) => void;
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function credentialsOf(redisUrl: string): { host: string; secrets: string[] } {
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    return { host: UNREADABLE_REDIS_HOST, secrets: [] };
  }
  const secrets = [url.password, decoded(url.password)].filter(
    (secret) => secret.length > 0,
  );
  return { host: url.host || UNREADABLE_REDIS_HOST, secrets };
}

function withinTimeout(check: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer within ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  return Promise.race([check, timeout]).finally(() => clearTimeout(timer));
}

export async function verifyRedisOrExit({
  cache,
  queue,
  redisUrl,
  timeoutMs,
  exit,
}: RedisStartupCheck): Promise<void> {
  const reach = async () => {
    await cache.connect();
    await queue.ping();
  };
  try {
    await withinTimeout(reach(), timeoutMs);
  } catch (error) {
    const { host, secrets } = credentialsOf(redisUrl);
    let reason = error instanceof Error ? error.message : String(error);
    reason = reason.replace(/\/\/[^\s/@]*@/g, "//***@");
    for (const secret of secrets) reason = reason.split(secret).join("***");
    console.error(`Redis at ${host} failed the startup check: ${reason}`);
    exit(1);
  }
}
