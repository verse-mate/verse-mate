import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { verifyRedisOrExit } from "./redis-startup-check";

const PASSWORD = "s3cret-pass-9431";
const REDIS_URL = `rediss://default:${PASSWORD}@cache.example.test:25061/0`;

const connected = { connect: async () => undefined };
const answering = { ping: async () => "PONG" };

describe("Redis startup check", () => {
  const errors = spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    errors.mockClear();
  });

  afterAll(() => {
    errors.mockRestore();
  });

  function logged(): string {
    return errors.mock.calls.map((call) => call.join(" ")).join("\n");
  }

  it("exits with 1 when the queue ping never answers within the timeout", async () => {
    const exit = mock((_code: number) => {});

    await verifyRedisOrExit({
      cache: connected,
      queue: { ping: () => new Promise(() => {}) },
      redisUrl: REDIS_URL,
      timeoutMs: 20,
      exit,
    });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logged()).toContain("cache.example.test:25061");
  });

  it("exits with 1 when the connect fails, naming the host and not the password", async () => {
    const exit = mock((_code: number) => {});

    await verifyRedisOrExit({
      cache: {
        connect: async () => {
          throw new Error(`connect ECONNREFUSED ${REDIS_URL}`);
        },
      },
      queue: answering,
      redisUrl: REDIS_URL,
      timeoutMs: 1_000,
      exit,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(logged()).toContain("cache.example.test:25061");
    expect(logged()).not.toContain(PASSWORD);
  });

  it("keeps a malformed URL out of the log and still exits with 1", async () => {
    const exit = mock((_code: number) => {});

    await verifyRedisOrExit({
      cache: {
        connect: async () => {
          throw new Error(`Invalid URL redis://:${PASSWORD}@[bad`);
        },
      },
      queue: answering,
      redisUrl: `redis://:${PASSWORD}@[bad`,
      timeoutMs: 1_000,
      exit,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(logged()).toContain("<unreadable REDIS_URL>");
    expect(logged()).not.toContain(PASSWORD);
  });

  it("does not exit when Redis answers", async () => {
    const exit = mock((_code: number) => {});

    await verifyRedisOrExit({
      cache: connected,
      queue: answering,
      redisUrl: REDIS_URL,
      timeoutMs: 1_000,
      exit,
    });

    expect(exit).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});
