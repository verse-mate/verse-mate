import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { extractClientIp } from "../auth/sso/sso.utils";
import { createIpRateLimit } from "../middleware/rate-limit";
import redisClient from "../shared/redis-client";
import { clientIp } from "./client-ip";
import { authRateLimiters, createRateLimit } from "./rate-limit.middleware";

const PROXY = "10.10.10.10";
const CLIENT = "198.51.100.7";

function memoryCache() {
  const counts = new Map<string, number>();
  return {
    increment: async (k: string) => {
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      return n;
    },
    ttl: async () => 60,
  };
}

function hit(
  limiter: (ctx: unknown) => Promise<void>,
  cache: ReturnType<typeof memoryCache> | typeof redisClient,
  socket: string,
  headers: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  return limiter({
    request: new Request("http://localhost/auth/signup", { headers }),
    server: { requestIP: () => ({ address: socket, family: "IPv4", port: 1 }) },
    store: { cache },
    body,
    set: {},
  }).then(
    () => "ok",
    (e: { status?: number }) => e.status,
  );
}

const savedHops = process.env.TRUSTED_PROXY_HOPS;
function hops(value: string | undefined) {
  if (value === undefined)
    Reflect.deleteProperty(process.env, "TRUSTED_PROXY_HOPS");
  else process.env.TRUSTED_PROXY_HOPS = value;
}
afterEach(() => hops(savedHops));

describe("once the proxy count is set, the signup and SSO limiters key on an address the caller cannot choose", () => {
  beforeEach(() => hops("1"));

  it("a prepended X-Forwarded-For does not win a new signup bucket", async () => {
    const cache = memoryCache();
    const results = [];
    for (let i = 1; i <= 4; i++) {
      results.push(
        await hit(authRateLimiters.signup, cache, PROXY, {
          "x-forwarded-for": `10.0.0.${i}, ${CLIENT}`,
        }),
      );
    }
    expect(results).toEqual(["ok", "ok", "ok", 429]);
  });

  it("the SSO limiter ignores prepended entries too", async () => {
    const cache = memoryCache();
    const results = [];
    for (let i = 1; i <= 11; i++) {
      results.push(
        await hit(authRateLimiters.sso, cache, PROXY, {
          "x-forwarded-for": `10.0.0.${i}, ${CLIENT}`,
        }),
      );
    }
    expect(results.at(-1)).toBe(429);
  });

  it("X-Real-IP is not trusted", async () => {
    const cache = memoryCache();
    const results = [];
    for (let i = 1; i <= 4; i++) {
      results.push(
        await hit(authRateLimiters.signup, cache, PROXY, {
          "x-real-ip": `10.0.0.${i}`,
        }),
      );
    }
    expect(results).toEqual(["ok", "ok", "ok", 429]);
  });

  it("without a forwarding header each caller gets their own socket bucket, not a shared unknown", async () => {
    const cache = memoryCache();
    for (let i = 0; i < 3; i++)
      await hit(authRateLimiters.signup, cache, "203.0.113.1");
    expect(await hit(authRateLimiters.signup, cache, "203.0.113.1")).toBe(429);
    expect(await hit(authRateLimiters.signup, cache, "203.0.113.2")).toBe("ok");
  });

  it("TRUSTED_PROXY_HOPS=0 ignores X-Forwarded-For entirely", async () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    const cache = memoryCache();
    const results = [];
    for (let i = 1; i <= 4; i++) {
      results.push(
        await hit(authRateLimiters.signup, cache, "203.0.113.9", {
          "x-forwarded-for": `10.0.0.${i}`,
        }),
      );
    }
    expect(results).toEqual(["ok", "ok", "ok", 429]);
  });

  it("the per-route IP limiter and the recorded session IP use the same address", async () => {
    const limiter = createIpRateLimit(1);
    const server = {
      requestIP: () => ({ address: PROXY, family: "IPv4", port: 1 }),
    };
    const req = (spoof: string) =>
      new Request("http://localhost/", {
        headers: { "x-forwarded-for": `${spoof}, ${CLIENT}` },
      });
    expect(
      limiter({ request: req("10.0.0.1"), set: {}, server } as never),
    ).toBeUndefined();
    expect(
      limiter({ request: req("10.0.0.2"), set: {}, server } as never),
    ).toBeDefined();
    expect(extractClientIp(req("10.0.0.3"), server)).toBe(CLIENT);
  });
});

describe("the login limiter cannot be used to lock someone else out", () => {
  const VICTIM = "victim@example.test";
  beforeEach(() => hops("1"));

  function login(
    cache: ReturnType<typeof memoryCache>,
    ip: string,
    email = VICTIM,
  ) {
    return hit(authRateLimiters.login, cache, ip, {}, { email });
  }

  it("five guesses from one address block that address, not the account's owner", async () => {
    const cache = memoryCache();
    for (let i = 0; i < 5; i++)
      expect(await login(cache, "198.51.100.1")).toBe("ok");
    expect(await login(cache, "198.51.100.1")).toBe(429);
    expect(await login(cache, "198.51.100.2")).toBe("ok");
  });

  it("the email is keyed case-insensitively, so casing buys no extra guesses", async () => {
    const cache = memoryCache();
    for (let i = 0; i < 5; i++)
      await login(cache, "198.51.100.1", i % 2 ? VICTIM : VICTIM.toUpperCase());
    expect(
      await login(cache, "198.51.100.1", ` ${VICTIM.toUpperCase()} `),
    ).toBe(429);
  });

  it("spraying many accounts from one address is throttled", async () => {
    const cache = memoryCache();
    const results = [];
    for (let i = 0; i < 31; i++)
      results.push(
        await hit(
          authRateLimiters.loginIp,
          cache,
          "198.51.100.3",
          {},
          {
            email: `user-${i}@example.test`,
          },
        ),
      );
    expect(results.slice(0, 30).every((r) => r === "ok")).toBe(true);
    expect(results[30]).toBe(429);
  });
});

describe("the limiter counts atomically", () => {
  it("a concurrent burst of 100 lets exactly max through", async () => {
    const key = `atomic-${crypto.randomUUID()}`;
    const limiter = createRateLimit({
      windowSeconds: 60,
      max: 5,
      keyGenerator: () => key,
    });
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        hit(limiter, redisClient, "203.0.113.5"),
      ),
    );
    await redisClient.delete(`rate-limit:${key}`);
    expect(results.filter((r) => r === "ok")).toHaveLength(5);
    expect(results.filter((r) => r === 429)).toHaveLength(95);
  });

  it("the counter carries the window as its expiry", async () => {
    const key = `atomic-ttl-${crypto.randomUUID()}`;
    const limiter = createRateLimit({
      windowSeconds: 60,
      max: 5,
      keyGenerator: () => key,
    });
    await hit(limiter, redisClient, "203.0.113.5");
    const ttl = await redisClient.ttl(`rate-limit:${key}`);
    await redisClient.delete(`rate-limit:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("a counter left in the old JSON format is replaced rather than failing the request", async () => {
    const key = `atomic-legacy-${crypto.randomUUID()}`;
    await redisClient.set(`rate-limit:${key}`, { count: 3 }, "60s");
    const limiter = createRateLimit({
      windowSeconds: 60,
      max: 5,
      keyGenerator: () => key,
    });
    const result = await hit(limiter, redisClient, "203.0.113.5");
    await redisClient.delete(`rate-limit:${key}`);
    expect(result).toBe("ok");
  });
});

describe("TRUSTED_PROXY_HOPS is loud when it cannot be read", () => {
  const request = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "192.0.2.1, 192.0.2.2, 192.0.2.3" },
  });
  const server = { requestIP: () => ({ address: PROXY }) };

  for (const raw of ["-1", "abc", "1.5", "2hops"]) {
    it(`"${raw}" is reported and read as not set`, () => {
      process.env.TRUSTED_PROXY_HOPS = raw;
      const errors = spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(clientIp(request, server)).toBe("192.0.2.1");
        expect(errors.mock.calls.flat().join(" ")).toContain(
          `TRUSTED_PROXY_HOPS "${raw}"`,
        );
      } finally {
        errors.mockRestore();
      }
    });
  }

  it("a whole number is used as given", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(request, server)).toBe("192.0.2.2");
  });
});

describe("until the proxy count is set, nothing a user does today is refused because of this change", () => {
  beforeEach(() => hops(undefined));

  it("Deployed without the proxy count: the sign-in limits do not apply", async () => {
    const cache = memoryCache();
    const results = [];
    for (let i = 0; i < 40; i++)
      results.push(
        await hit(
          authRateLimiters.login,
          cache,
          PROXY,
          { "x-forwarded-for": CLIENT },
          { email: "same@example.test" },
        ),
        await hit(authRateLimiters.loginIp, cache, PROXY, {
          "x-forwarded-for": CLIENT,
        }),
      );
    expect(results.every((r) => r === "ok")).toBe(true);
  });

  it("network-keyed limits read the first forwarded address, as before this change", async () => {
    const cache = memoryCache();
    const results = [];
    for (let i = 1; i <= 4; i++)
      results.push(
        await hit(authRateLimiters.signup, cache, PROXY, {
          "x-forwarded-for": `198.51.100.${i}, ${PROXY}`,
        }),
      );
    expect(results).toEqual(["ok", "ok", "ok", "ok"]);
    expect(
      clientIp(new Request("http://localhost/"), {
        requestIP: () => ({ address: CLIENT }),
      }),
    ).toBe(CLIENT);
  });

  it("the log shows how many forwarded addresses requests carry, once per count, and no address", () => {
    const logs = spyOn(console, "log").mockImplementation(() => {});
    try {
      const forwarded = (xff: string) =>
        clientIp(
          new Request("http://localhost/", {
            headers: { "x-forwarded-for": xff },
          }),
          { requestIP: () => ({ address: PROXY }) },
        );
      forwarded("192.0.2.10, 192.0.2.11, 192.0.2.12, 192.0.2.13, 192.0.2.14");
      forwarded("192.0.2.20, 192.0.2.21, 192.0.2.22, 192.0.2.23, 192.0.2.24");
      const lines = logs.mock.calls.flat().join("\n");
      expect(lines.match(/carried 5 forwarded/g)).toHaveLength(1);
      expect(lines).not.toMatch(/192\.0\.2\./);
    } finally {
      logs.mockRestore();
    }
  });
});

describe("the confirmation email cannot be used to flood an address", () => {
  it("one account gets five confirmation emails an hour, and another account is not affected", async () => {
    const cache = memoryCache();
    const send = (userId: string) =>
      authRateLimiters
        .sendEmailVerification({
          request: new Request("http://localhost/auth/send-email-verification"),
          server: {
            requestIP: () => ({ address: CLIENT, family: "IPv4", port: 1 }),
          },
          store: { cache },
          currentUserId: userId,
          set: {},
        })
        .then(
          () => "ok",
          (e: { status?: number }) => e.status,
        );
    for (let i = 0; i < 5; i += 1) expect(await send("u1")).toBe("ok");
    expect(await send("u1")).toBe(429);
    expect(await send("u2")).toBe("ok");
  });
});
