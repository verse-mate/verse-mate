import ms from "ms";
import { type RedisClientType, createClient } from "redis";

class RedisClient {
  private client: RedisClientType;

  constructor(redisUrl = "redis://localhost:6379") {
    const url = new URL(redisUrl);
    const password = url.password || undefined;

    this.client = createClient({
      url: redisUrl,
      ...(password ? { password } : {}),
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.log(
              `Max retry attempts reached. Please check your Redis server at ${redisUrl}`,
            );
            return false;
          }
          console.log(`Redis connection attempt ${retries}`);
          return Math.min(retries * 100, 3000);
        },
      },
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
      const ttlMs = ms(ttl);
      if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new Error(`Invalid TTL provided: "${ttl}"`);
      }

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

  async delete(key: string): Promise<number> {
    await this.connect();
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error("Error deleting key from Redis:", error);
      throw error;
    }
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
