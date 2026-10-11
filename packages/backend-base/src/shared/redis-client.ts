import ms from "ms";
import { type RedisClientType, createClient } from "redis";

const COUNT_WITHIN_WINDOW = `
local current = redis.call('GET', KEYS[1])
if current and not tonumber(current) then redis.call('DEL', KEYS[1]) end
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

// Check if URL uses SSL (rediss://)
const isSSLUrl = (url: string) => url.startsWith("rediss://");

const APPEND_TO_JSON_ARRAY = `
local raw = redis.call("GET", KEYS[1])
local list = raw and cjson.decode(raw) or {}
table.insert(list, ARGV[1])
while #list > tonumber(ARGV[3]) do table.remove(list, 1) end
redis.call("SET", KEYS[1], cjson.encode(list), "PX", ARGV[2])
return #list
`;

const REMOVE_FROM_JSON_ARRAY = `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local list = cjson.decode(raw)
local kept = {}
for _, item in ipairs(list) do
  if item ~= ARGV[1] then table.insert(kept, item) end
end
if #kept == #list then return 0 end
if #kept == 0 then
  redis.call("DEL", KEYS[1])
else
  local ttl = redis.call("PTTL", KEYS[1])
  if ttl > 0 then
    redis.call("SET", KEYS[1], cjson.encode(kept), "PX", ttl)
  elseif ttl == -1 then
    redis.call("SET", KEYS[1], cjson.encode(kept))
  else
    redis.call("DEL", KEYS[1])
  end
end
return #list - #kept
`;

const TAKE = `
local raw = redis.call("GET", KEYS[1])
if raw then redis.call("DEL", KEYS[1]) end
return raw
`;

const INCREMENT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return count
`;

function parseTtl(ttl: string): number {
  const ttlMs = ms(ttl);
  if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0)
    throw new Error(`Invalid TTL provided: "${ttl}"`);
  return ttlMs;
}

class RedisClient {
  private client: RedisClientType;

  constructor(redisUrl = "redis://localhost:6379") {
    const url = new URL(redisUrl);
    const password = url.password || undefined;
    const useSSL = isSSLUrl(redisUrl);

    // For SSL connections, use separate socket config to handle self-signed certs.
    // `keepAlive: 30_000` keeps the connection alive against DigitalOcean's
    // 5-minute idle TCP timeout; without it the cache client cycles
    // through "Socket closed unexpectedly → reconnect" every 5 minutes
    // and the in-flight commands during the reset throw transient errors.
    const socketConfig = useSSL
      ? {
          tls: true as const,
          rejectUnauthorized: false,
          keepAlive: 30_000,
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.log(
                `Max retry attempts reached. Please check your Redis server at ${redisUrl}`,
              );
              return false;
            }
            console.log(`Redis connection attempt ${retries}`);
            return Math.min(retries * 100, 3000);
          },
        }
      : {
          keepAlive: 30_000,
          reconnectStrategy: (retries: number) => {
            if (retries > 10) {
              console.log(
                `Max retry attempts reached. Please check your Redis server at ${redisUrl}`,
              );
              return false;
            }
            console.log(`Redis connection attempt ${retries}`);
            return Math.min(retries * 100, 3000);
          },
        };

    this.client = createClient({
      url: redisUrl,
      ...(password ? { password } : {}),
      socket: socketConfig,
    });

    this.client.on("error", (error) => {
      console.error("Redis Client Error", error);
    });

    this.client.on("connect", () => {
      console.log("Connected to Redis");
    });

    this.client.on("reconnecting", () => {
      console.log("Reconnecting to Redis");
    });

    this.client.on("end", () => {
      console.log("Disconnected from Redis");
    });
  }

  async connect() {
    if (!this.client.isOpen) {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Redis connection timeout")), 3000),
        );
        await Promise.race([this.client.connect(), timeout]);
      } catch (error) {
        console.error("Error connecting to Redis:", error);
        throw error;
      }
    }
  }

  async disconnect() {
    if (this.client.isOpen) {
      try {
        await this.client.disconnect();
      } catch (error) {
        console.error("Error disconnecting from Redis:", error);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    await this.connect();
    try {
      const value = await this.client.get(key);
      if (value) {
        return JSON.parse(value);
      }

      return null;
    } catch (error) {
      console.error("Error getting key from Redis:", error);
      throw error;
    }
  }

  async set(key: string, value: object, ttl: string): Promise<string | null> {
    await this.connect();
    try {
      const ttlMs = parseTtl(ttl);

      let payload: string;
      try {
        payload = JSON.stringify(value);
      } catch (serializationError) {
        console.error("Error serializing value for Redis:", serializationError);
        throw new Error(`Failed to serialize value for Redis key "${key}"`);
      }

      return await this.client.set(key, payload, {
        PX: ttlMs,
      });
    } catch (error) {
      console.error("Error setting value in Redis:", error);
      throw error instanceof Error
        ? error
        : new Error("Redis set operation failed");
    }
  }

  async take<T>(key: string): Promise<T | null> {
    await this.connect();
    try {
      const value = await this.client.eval(TAKE, { keys: [key] });
      return typeof value === "string" ? JSON.parse(value) : null;
    } catch (error) {
      console.error("Error taking key from Redis:", error);
      throw error;
    }
  }

  async increment(key: string, ttl: string): Promise<number> {
    await this.connect();
    try {
      return Number(
        await this.client.eval(INCREMENT, {
          keys: [key],
          arguments: [String(parseTtl(ttl))],
        }),
      );
    } catch (error) {
      console.error("Error incrementing a Redis counter:", error);
      throw error;
    }
  }

  async setPersistent(key: string, value: object): Promise<string | null> {
    await this.connect();
    try {
      return await this.client.set(key, JSON.stringify(value));
    } catch (error) {
      console.error("Error setting persistent value in Redis:", error);
      throw error;
    }
  }

  async delete(key: string): Promise<number> {
    await this.connect();
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error("Error deleting key from Redis:", error);
      throw error;
    }
  }

  async appendToJsonArray(
    key: string,
    value: string,
    ttl: string,
    limit: number,
  ): Promise<void> {
    await this.connect();
    const ttlMs = parseTtl(ttl);
    try {
      await this.client.eval(APPEND_TO_JSON_ARRAY, {
        keys: [key],
        arguments: [value, String(ttlMs), String(limit)],
      });
    } catch (error) {
      console.error("Error appending to a Redis array:", error);
      throw error;
    }
  }

  async removeFromJsonArray(key: string, value: string): Promise<void> {
    await this.connect();
    try {
      await this.client.eval(REMOVE_FROM_JSON_ARRAY, {
        keys: [key],
        arguments: [value],
      });
    } catch (error) {
      console.error("Error removing from a Redis array:", error);
      throw error;
    }
  }

  async increment(key: string, windowSeconds: number): Promise<number> {
    await this.connect();
    return Number(
      await this.client.eval(COUNT_WITHIN_WINDOW, {
        keys: [key],
        arguments: [String(windowSeconds)],
      }),
    );
  }

  async ttl(key: string): Promise<number> {
    await this.connect();
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error("Error getting TTL from Redis:", error);
      throw error;
    }
  }
}

const redisUrl = process.env.REDIS_URL ?? "redis://:abcd1234@localhost:6379/0";

// Export both the class and instance with explicit typing
export { RedisClient };
export default new RedisClient(redisUrl);
