import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import { RedisClient } from "./redis-client";

const PASSWORD = "s3cret-pass-9431";

function reconnectStrategyOf(url: string) {
  return (
    new RedisClient(url) as unknown as {
      client: {
        options: {
          socket: { reconnectStrategy: (retries: number) => number | false };
        };
      };
    }
  ).client.options.socket.reconnectStrategy;
}

describe("Redis reconnect log", () => {
  const log = spyOn(console, "log").mockImplementation(() => {});

  afterEach(() => {
    log.mockClear();
  });

  afterAll(() => {
    log.mockRestore();
  });

  for (const url of [
    `redis://default:${PASSWORD}@cache.example.test:6380/0`,
    `rediss://default:${PASSWORD}@cache.example.test:6380/0`,
  ]) {
    it(`names the host and not the password when giving up on ${url.split(":")[0]}`, () => {
      const result = reconnectStrategyOf(url)(11);

      expect(result).toBe(false);
      const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).toContain("cache.example.test:6380");
      expect(logged).not.toContain(PASSWORD);
    });
  }
});
