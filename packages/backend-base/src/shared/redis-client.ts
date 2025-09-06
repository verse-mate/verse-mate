import KeyvRedis, { type RedisClientConnectionType } from "@keyv/redis";
import Keyv from "keyv";
import ms from "ms";

class CacheService {
  private readonly keyv: Keyv;
  private readonly redis: RedisClientConnectionType;

  constructor(redisUrl = "redis://localhost:6379") {
    const url = new URL(redisUrl);
    const password = url.password || undefined;

    const store = new KeyvRedis({
      url: redisUrl,
      ...(password ? { password } : {}),
      socket: {
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
      },
    });
    this.redis = store.client;
    this.keyv = new Keyv({ store });

    this.keyv.on("error", (error) => {
      console.error("Redis Client Error", error);
    });

    this.keyv.on("connect", () => {
      console.log("Connected to Redis");
    });

    this.keyv.on("reconnecting", () => {
      console.log("Reconnecting to Redis");
    });

    this.keyv.on("end", () => {
      console.log("Disconnected from Redis");
    });
  }

  async disconnect() {
    return this.keyv.disconnect();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.keyv.get(key);
      if (!value) {
        return null;
      }

      return value as T;
    } catch (error) {
      console.error("Error getting key from Redis:", error);
      throw error;
    }
  }

  async set(key: string, value: object, ttl: string): Promise<boolean> {
    try {
      return await this.keyv.set(key, value, ms(ttl));
    } catch (error) {
      console.error("Error setting value in Redis:", error);
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      return await this.keyv.delete(key);
    } catch (error) {
      console.error("Error deleting key from Redis:", error);
      throw error;
    }
  }
}

const redisUrl = process.env.REDIS_URL ?? "redis://:abcd1234@localhost:6379/0";

// Export both the class and instance with explicit typing
export { CacheService };
export default new CacheService(redisUrl);
