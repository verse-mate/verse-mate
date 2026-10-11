import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { extractClientIp } from "../auth/sso/sso.utils";
import { createIpRateLimit } from "../middleware/rate-limit";
import redisClient from "../shared/redis-client";
import { clientBucket, clientIp, forgetClientIpLogs } from "./client-ip";
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

  it("the log shows each new fewest count of forwarded addresses, never a larger one, and no address", () => {
    forgetClientIpLogs();
    const logs = spyOn(console, "log").mockImplementation(() => {});
    try {
      const forwarded = (n: number) =>
        clientIp(
          new Request("http://localhost/", {
            headers: {
              "x-forwarded-for": Array.from(
                { length: n },
                (_, i) => `192.0.2.${i + 10}`,
              ).join(", "),
            },
          }),
          { requestIP: () => ({ address: PROXY }) },
        );
      for (const n of [3, 5, 3, 9, 2, 4]) forwarded(n);
      const lines = logs.mock.calls.flat().join("\n");
      expect(lines.match(/carried \d+/g)).toEqual(["carried 3", "carried 2"]);
      expect(lines).not.toMatch(/192\.0\.2\./);
    } finally {
      logs.mockRestore();
    }
  });
});

describe("an unreadable proxy count is not a confirmed one", () => {
  it("the sign-in limits stay off", async () => {
    hops("2hops");
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      const cache = memoryCache();
      const results = [];
      for (let i = 0; i < 7; i++)
        results.push(
          await hit(
            authRateLimiters.login,
            cache,
            PROXY,
            {},
            { email: "x@example.test" },
          ),
        );
      expect(results.every((r) => r === "ok")).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  it("a request with no forwarded address is not logged as a count", () => {
    hops(undefined);
    const logs = spyOn(console, "log").mockImplementation(() => {});
    try {
      clientIp(new Request("http://localhost/"), {
        requestIP: () => ({ address: CLIENT }),
      });
      expect(logs.mock.calls.flat().join(" ")).not.toContain("carried 0");
    } finally {
      logs.mockRestore();
    }
  });
});

function recordingCache() {
  const keys: string[] = [];
  const inner = memoryCache();
  return {
    keys,
    increment: (k: string) => {
      keys.push(k);
      return inner.increment(k);
    },
    ttl: inner.ttl,
  };
}

const socketOf = (address: string) => ({
  requestIP: () => ({ address, family: "IPv4", port: 1 }),
});

describe("with TRUSTED_PROXY_HOPS unset, every limiter reads the client as main did", () => {
  beforeEach(() => hops(undefined));

  const mainSignup = (h: Record<string, string>) =>
    h["x-forwarded-for"] || h["x-real-ip"] || "unknown";
  const mainFirst = (h: Record<string, string>) =>
    (h["x-forwarded-for"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] ||
    h["x-real-ip"] ||
    undefined;
  const mainPerRoute = (h: Record<string, string>) =>
    h["x-forwarded-for"]
      ? h["x-forwarded-for"].split(",")[0].trim()
      : "unknown";

  async function read(headers: Record<string, string>) {
    const signup = recordingCache();
    const sso = recordingCache();
    await hit(authRateLimiters.signup, signup as never, PROXY, headers);
    await hit(authRateLimiters.sso, sso as never, PROXY, headers);
    const request = new Request("http://localhost/", { headers });
    return {
      signup: signup.keys[0].replace("rate-limit:signup:", ""),
      sso: sso.keys[0].replace("rate-limit:sso:", ""),
      session: extractClientIp(request, socketOf(PROXY)),
      perRoute: clientBucket(request, socketOf(PROXY)),
    };
  }

  it("a single forwarded address", async () => {
    const h = { "x-forwarded-for": CLIENT };
    expect(await read(h)).toEqual({
      signup: mainSignup(h),
      sso: mainFirst(h) as string,
      session: mainFirst(h),
      perRoute: mainPerRoute(h),
    });
  });

  it("a forwarded chain: the first entry, which main's signup key folded in with the rest", async () => {
    const h = { "x-forwarded-for": `${CLIENT}, ${PROXY}` };
    expect(await read(h)).toEqual({
      signup: CLIENT,
      sso: mainFirst(h) as string,
      session: mainFirst(h),
      perRoute: mainPerRoute(h),
    });
    expect(mainSignup(h).startsWith(CLIENT)).toBe(true);
  });

  it("X-Real-IP alone, as main read it for signup, SSO and the session", async () => {
    const h = { "x-real-ip": CLIENT };
    const got = await read(h);
    expect(got.signup).toBe(mainSignup(h));
    expect(got.sso).toBe(mainFirst(h) as string);
    expect(got.session).toBe(mainFirst(h) as string);
    expect(got.perRoute).toBe(CLIENT);
  });

  it("no header at all: the socket, where main shared one unknown bucket", async () => {
    expect(await read({})).toEqual({
      signup: PROXY,
      sso: PROXY,
      session: PROXY,
      perRoute: PROXY,
    });
  });

  it("an IPv6 client keeps its full address", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "2001:db8:1:2::7" },
    });
    expect(clientBucket(request, socketOf(PROXY))).toBe("2001:db8:1:2::7");
  });
});

describe("a limiter key is always an address, whatever the header holds", () => {
  afterEach(() => forgetClientIpLogs());

  const read = (headers: Record<string, string>, socket = PROXY) =>
    clientIp(new Request("http://localhost/", { headers }), socketOf(socket));

  it("a forwarded value that is not an address falls back to X-Real-IP, then the socket", () => {
    hops(undefined);
    const junk = `${"a".repeat(15_000)}`;
    expect(read({ "x-forwarded-for": junk, "x-real-ip": CLIENT })).toBe(CLIENT);
    expect(read({ "x-forwarded-for": junk })).toBe(PROXY);
  });

  it("ports and brackets are dropped, and a v4-mapped socket reads as plain IPv4", () => {
    hops(undefined);
    expect(read({ "x-forwarded-for": `${CLIENT}:51234` })).toBe(CLIENT);
    expect(read({ "x-forwarded-for": "[2001:db8::7]:443" })).toBe(
      "2001:db8::7",
    );
    expect(read({}, `::ffff:${PROXY}`)).toBe(PROXY);
  });

  it("once the proxy count is set, an entry the proxy wrote that is not an address falls back to the socket", () => {
    hops("1");
    expect(read({ "x-forwarded-for": `${CLIENT}, garbage` })).toBe(PROXY);
  });

  it("blank forwarded entries are skipped", () => {
    hops("1");
    expect(read({ "x-forwarded-for": `${CLIENT}, , ` })).toBe(CLIENT);
  });

  it("blank or padded TRUSTED_PROXY_HOPS values read as written", () => {
    const chain = { "x-forwarded-for": `192.0.2.1, ${CLIENT}` };
    hops("");
    expect(read(chain)).toBe("192.0.2.1");
    hops("   ");
    expect(read(chain)).toBe("192.0.2.1");
    hops(" 1 ");
    expect(read(chain)).toBe(CLIENT);
  });
});

describe("once the proxy count is set, an IPv6 host cannot step around the limits inside its own network", () => {
  beforeEach(() => hops("1"));

  it("addresses in one /64 share a sign-in bucket; another /64 does not", async () => {
    const cache = memoryCache();
    const from = (address: string) =>
      hit(authRateLimiters.loginIp, cache, PROXY, {
        "x-forwarded-for": address,
      });
    const results = [];
    for (let i = 1; i <= 31; i++)
      results.push(await from(`2001:db8:1:2::${i.toString(16)}`));
    expect(results.slice(0, 30).every((r) => r === "ok")).toBe(true);
    expect(results[30]).toBe(429);
    expect(await from("2001:db8:1:3::1")).toBe("ok");
  });

  it("the bucket is the same however the /64 is written", () => {
    const bucket = (address: string) =>
      clientBucket(
        new Request("http://localhost/", {
          headers: { "x-forwarded-for": address },
        }),
        socketOf(PROXY),
      );
    expect(bucket("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(bucket("2001:0DB8:0001:0002:ffff:0:0:1")).toBe("2001:db8:1:2::/64");
    expect(bucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(bucket("::1")).toBe("0:0:0:0::/64");
    expect(bucket("64:ff9b::192.0.2.1")).toBe("64:ff9b:0:0::/64");
    expect(bucket(CLIENT)).toBe(CLIENT);
  });
});

describe("a proxy count higher than the chain is reported", () => {
  afterEach(() => forgetClientIpLogs());

  it("once per new shortest chain, with the count and no address", () => {
    hops("2");
    forgetClientIpLogs();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const header of [CLIENT, CLIENT, "", `192.0.2.1, ${CLIENT}`])
        clientIp(
          new Request("http://localhost/", {
            headers: header ? { "x-forwarded-for": header } : {},
          }),
          socketOf(PROXY),
        );
      const lines = errors.mock.calls.flat().join("\n");
      expect(lines.match(/carried \d+/g)).toEqual(["carried 1"]);
      expect(lines).toContain("too high");
      expect(lines).not.toContain(CLIENT);
    } finally {
      errors.mockRestore();
    }
  });

  it("an unreadable value is reported once, not on every request", () => {
    hops("abc");
    forgetClientIpLogs();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (let i = 0; i < 3; i++) clientIp(new Request("http://localhost/"));
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });
});

describe("a refused request carries no email or address", () => {
  beforeEach(() => hops("1"));

  it("the counter key holds a digest of the email, and the 429 holds only the wait", async () => {
    const cache = recordingCache();
    const email = "Someone@Example.test";
    let refusal: unknown;
    for (let i = 0; i < 6; i++)
      await authRateLimiters
        .login({
          request: new Request("http://localhost/auth/login"),
          server: socketOf(CLIENT),
          store: { cache },
          body: { email },
          set: {},
        })
        .catch((e: unknown) => {
          refusal = e;
        });
    expect(refusal).toEqual({
      status: 429,
      message: "Too many login attempts, please try again in a minute",
      retryAfter: 60,
    });
    const keys = cache.keys.join(" ").toLowerCase();
    expect(keys).not.toContain("someone");
    expect(keys).not.toContain("example");
  });

  it("the forgot-password key holds a digest too", async () => {
    const cache = recordingCache();
    await hit(
      authRateLimiters.forgotPassword,
      cache as never,
      CLIENT,
      {},
      {
        email: "someone@example.test",
      },
    );
    expect(cache.keys[0]).toMatch(/^rate-limit:forgot-password:[\w-]{43}$/);
  });
});

describe("the counter keeps a fixed window and fails closed", () => {
  it("a hit late in the window does not extend it", async () => {
    const key = `window-${crypto.randomUUID()}`;
    const limiter = createRateLimit({
      windowSeconds: 2,
      max: 5,
      keyGenerator: () => key,
    });
    await hit(limiter, redisClient, CLIENT);
    await Bun.sleep(1_100);
    await hit(limiter, redisClient, CLIENT);
    const ttl = await redisClient.ttl(`rate-limit:${key}`);
    await redisClient.delete(`rate-limit:${key}`);
    expect(ttl).toBeLessThanOrEqual(1);
  });

  it("a counter that cannot be reached refuses the request instead of letting it through", async () => {
    const down = {
      increment: () => Promise.reject(new Error("connection refused")),
      ttl: async () => -1,
    };
    const limiter = createRateLimit({
      windowSeconds: 60,
      max: 5,
      keyGenerator: () => "down",
    });
    await expect(
      limiter({
        request: new Request("http://localhost/"),
        store: { cache: down },
        set: {},
      }),
    ).rejects.toThrow("connection refused");
  });

  it("with TRUSTED_PROXY_HOPS unset, sign-in does not touch the counter at all", async () => {
    hops(undefined);
    const down = {
      increment: () => Promise.reject(new Error("connection refused")),
      ttl: async () => -1,
    };
    expect(
      await hit(
        authRateLimiters.login,
        down as never,
        CLIENT,
        {},
        {
          email: "a@example.test",
        },
      ),
    ).toBe("ok");
    expect(await hit(authRateLimiters.loginIp, down as never, CLIENT)).toBe(
      "ok",
    );
  });
});

describe("the per-route IP limiter does not grow without bound", () => {
  it("expired windows are dropped, and live ones never pass the cap", () => {
    hops(undefined);
    const logs = spyOn(console, "log").mockImplementation(() => {});
    const limiter = createIpRateLimit(1);
    const now = spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const at = (ip: string) =>
        limiter({
          request: new Request("http://localhost/", {
            headers: { "x-forwarded-for": ip },
          }),
          set: {},
        } as never);
      for (let i = 0; i < 10_000; i++)
        at(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`);
      expect(limiter.tracked()).toBe(10_000);
      now.mockReturnValue(1_000 + 61_000);
      at("192.0.2.200");
      expect(limiter.tracked()).toBe(1);
      let most = 0;
      for (let i = 0; i < 20_000; i++) {
        at(`11.${i >> 16}.${(i >> 8) & 255}.${i & 255}`);
        most = Math.max(most, limiter.tracked());
      }
      expect(most).toBe(10_000);
    } finally {
      now.mockRestore();
      logs.mockRestore();
    }
  });
});
