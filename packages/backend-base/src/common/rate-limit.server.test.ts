import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { authRateLimiters } from "./rate-limit.middleware";

describe("a limiter reads the socket through a listening server, even when the route handler never names it", () => {
  const keys: string[] = [];
  const cache = {
    increment: async (key: string) => {
      keys.push(key);
      return 1;
    },
  };
  const app = new Elysia()
    .state("cache", cache)
    .post("/signup", ({ body }) => body, {
      beforeHandle: authRateLimiters.signup,
    });
  const savedHops = process.env.TRUSTED_PROXY_HOPS;

  beforeAll(() => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    app.listen(0);
  });
  afterAll(() => {
    app.stop();
    if (savedHops === undefined)
      Reflect.deleteProperty(process.env, "TRUSTED_PROXY_HOPS");
    else process.env.TRUSTED_PROXY_HOPS = savedHops;
  });

  it("with TRUSTED_PROXY_HOPS=0 signup keys on the socket, not on a shared unknown bucket", async () => {
    for (const forwarded of ["198.51.100.1", "198.51.100.2"])
      await fetch(`http://localhost:${app.server?.port}/signup`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": forwarded,
        },
        body: "{}",
      });
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key).not.toBe("rate-limit:signup:unknown");
      expect(key).not.toContain("198.51.100.");
    }
  });
});
