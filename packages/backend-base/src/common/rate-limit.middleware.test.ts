import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";

import { extractClientIp } from "../auth/sso/sso.utils";
import { createIpRateLimit } from "../middleware/rate-limit";
import redisClient from "../shared/redis-client";
import {
  clientBucket,
  clientChain,
  clientIp,
  clientNetwork,
  forgetClientIpLogs,
} from "./client-ip";
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
  beforeEach(() => forgetClientIpLogs());
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
  const windows: Record<string, number> = {};
  const inner = memoryCache();
  return {
    keys,
    windows,
    increment: (k: string, windowSeconds: number) => {
      keys.push(k);
      windows[k.split(":")[1]] = windowSeconds;
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

  type Headers = Record<string, string>;
  const mainSignup = (h: Headers) =>
    h["x-forwarded-for"] || h["x-real-ip"] || "unknown";
  const mainFirst = (h: Headers) =>
    (h["x-forwarded-for"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] ||
    h["x-real-ip"] ||
    undefined;
  const mainPerRoute = (h: Headers) =>
    h["x-forwarded-for"]
      ? h["x-forwarded-for"].split(",")[0].trim()
      : "unknown";
  const main = (h: Headers) => ({
    signup: mainSignup(h),
    sso: mainFirst(h) ?? "unknown",
    session: mainFirst(h),
    perRoute: mainPerRoute(h),
  });

  async function read(headers: Headers) {
    const sso = recordingCache();
    await hit(authRateLimiters.sso, sso as never, PROXY, headers);
    const request = new Request("http://localhost/", { headers });
    return {
      signup: clientChain(request, socketOf(PROXY)),
      sso: sso.keys[0].replace("rate-limit:sso:", ""),
      session: extractClientIp(request, socketOf(PROXY)),
      perRoute: clientBucket(request, socketOf(PROXY)),
    };
  }

  const cases: [string, Headers, Partial<ReturnType<typeof main>>][] = [
    ["a single forwarded address", { "x-forwarded-for": CLIENT }, {}],
    ["a forwarded chain", { "x-forwarded-for": `${CLIENT}, ${PROXY}` }, {}],
    [
      "a port on the address: dropped, where main kept it in every key",
      { "x-forwarded-for": `${CLIENT}:51234` },
      { signup: CLIENT, sso: CLIENT, session: CLIENT, perRoute: CLIENT },
    ],
    [
      "a blank first entry: skipped, where main's signup kept it and its per-route key was empty",
      { "x-forwarded-for": `, ${CLIENT}` },
      { signup: CLIENT, perRoute: CLIENT },
    ],
    [
      "a proxy's literal unknown: never a key, where main used it",
      { "x-forwarded-for": `unknown, ${CLIENT}` },
      { signup: CLIENT, sso: PROXY, session: PROXY, perRoute: PROXY },
    ],
    [
      "X-Forwarded-For and X-Real-IP together",
      { "x-forwarded-for": CLIENT, "x-real-ip": "192.0.2.9" },
      {},
    ],
    [
      "X-Real-IP alone: the per-route limiter reads it too, where main shared one unknown bucket",
      { "x-real-ip": CLIENT },
      { perRoute: CLIENT },
    ],
    [
      "no header at all: the socket, where main shared one unknown bucket",
      {},
      { signup: PROXY, sso: PROXY, session: PROXY, perRoute: PROXY },
    ],
  ];

  for (const [name, headers, differences] of cases)
    it(name, async () => {
      expect(await read(headers)).toEqual({ ...main(headers), ...differences });
    });

  it("a caller who prepends someone's address does not share that person's signup bucket", async () => {
    const victim = await read({ "x-forwarded-for": CLIENT });
    const attacker = await read({
      "x-forwarded-for": `${CLIENT}, 203.0.113.66`,
    });
    expect(attacker.signup).not.toBe(victim.signup);
  });

  it("a single address is the signup key as it is, as for every other limiter", async () => {
    const cache = recordingCache();
    await hit(authRateLimiters.signup, cache as never, PROXY, {
      "x-forwarded-for": CLIENT,
    });
    await hit(authRateLimiters.signup, cache as never, PROXY);
    expect(cache.keys).toEqual([
      `rate-limit:signup:${CLIENT}`,
      `rate-limit:signup:${PROXY}`,
    ]);
  });

  it("a chain of addresses is keyed by its digest, so its length is fixed", async () => {
    const cache = recordingCache();
    const chain = Array.from(
      { length: 500 },
      (_, i) => `10.0.${i >> 8}.${i & 255}`,
    ).join(", ");
    await hit(authRateLimiters.signup, cache as never, PROXY, {
      "x-forwarded-for": chain,
    });
    expect(cache.keys).toEqual([
      `rate-limit:signup:${createHash("sha256").update(chain).digest("base64url")}`,
    ]);
  });

  it("a proxy that writes unknown first keys signup on the address after it", async () => {
    expect(
      (await read({ "x-forwarded-for": `unknown, ${CLIENT}` })).signup,
    ).toBe(CLIENT);
  });

  it("an IPv6 client keeps its full address, in lower case", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "2001:DB8:1:2::7" },
    });
    expect(clientBucket(request, socketOf(PROXY))).toBe("2001:db8:1:2::7");
  });

  it("with no request source at all the session address is empty, not unknown", () => {
    expect(extractClientIp(new Request("http://localhost/"))).toBeUndefined();
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
    expect(read({ "x-forwarded-for": `fe80::1%${"z".repeat(15_000)}` })).toBe(
      PROXY,
    );
    expect(read({ "x-forwarded-for": "fe80::1%eth0" })).toBe(PROXY);
  });

  it("an entry that would overflow the /64 arithmetic is not an address", () => {
    hops("1");
    for (const entry of [
      "1:2:3:4:5:6:7:8%a:b:c:d::",
      "fe80::1%a:b:c:d:e:f:1:2:3",
    ])
      expect(
        clientBucket(
          new Request("http://localhost/", {
            headers: { "x-forwarded-for": `${entry}, ${CLIENT}` },
          }),
          socketOf(PROXY),
        ),
      ).toBe(CLIENT);
    hops("2");
    expect(
      clientBucket(
        new Request("http://localhost/", {
          headers: {
            "x-forwarded-for": "1:2:3:4:5:6:7:8%a:b:c:d::, 192.0.2.4",
          },
        }),
        socketOf(PROXY),
      ),
    ).toBe(PROXY);
  });

  it("an address the URL parser refuses is not an address, and never throws", () => {
    hops(undefined);
    const refused = [
      "1:2::3:4:5.6.7.8",
      "1:2:3::4:5.6.7.8",
      "::1:2:3:4:5.6.7.8",
      "ba:b5::ab0:19:4.254.47.235",
      "2001::1:1:0:1.2.3.4",
      "0::1:1:0:1.2.3.4",
      "[1:0::1:0:1.2.3.4]:80",
    ];
    for (const entry of refused) {
      const request = new Request("http://localhost/", {
        headers: { "x-forwarded-for": `${entry}, ${CLIENT}` },
      });
      expect(clientIp(request, socketOf(PROXY))).toBe(PROXY);
      expect(clientChain(request, socketOf(PROXY))).toBe(CLIENT);
      expect(extractClientIp(request, socketOf(PROXY))).toBe(PROXY);
      expect(
        createIpRateLimit(1)({
          request,
          set: {},
          server: socketOf(PROXY),
        } as never),
      ).toBeUndefined();
    }
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const hex = () => Math.floor(random() * 0x10000).toString(16);
    const octet = () => Math.floor(random() * 256);
    for (let i = 0; i < 5_000; i++) {
      const groups = Array.from({ length: 1 + Math.floor(random() * 5) }, hex);
      const cut = Math.floor(random() * (groups.length + 1));
      const entry = `${groups.slice(0, cut).join(":")}::${groups.slice(cut).join(":")}${cut < groups.length ? ":" : ""}${octet()}.${octet()}.${octet()}.${octet()}`;
      expect(() =>
        clientIp(
          new Request("http://localhost/", {
            headers: { "x-forwarded-for": entry },
          }),
          socketOf(PROXY),
        ),
      ).not.toThrow();
    }
  });

  it("every spelling of a v4-mapped address reads as plain IPv4", () => {
    hops(undefined);
    for (const mapped of [
      "::ffff:198.51.100.7",
      "::FFFF:198.51.100.7",
      "0:0:0:0:0:ffff:198.51.100.7",
      "::ffff:c633:6407",
      "[::ffff:198.51.100.7]:80",
    ])
      expect(read({ "x-forwarded-for": mapped })).toBe(CLIENT);
  });

  it("ports and brackets are dropped, and a v4-mapped socket reads as plain IPv4", () => {
    hops(undefined);
    expect(read({ "x-forwarded-for": `${CLIENT}:51234` })).toBe(CLIENT);
    expect(read({ "x-forwarded-for": "[2001:db8::7]:443" })).toBe(
      "2001:db8::7",
    );
    expect(read({ "x-forwarded-for": "[2001:db8::7]" })).toBe("2001:db8::7");
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

  const inNetwork = (n: number) => `2001:db8:1:2::${n.toString(16)}`;

  for (const [name, limiter, max] of [
    ["signup", authRateLimiters.signup, 3],
    ["SSO", authRateLimiters.sso, 10],
  ] as const)
    it(`${name}: addresses in one /64 share a bucket; another /64 does not`, async () => {
      const cache = memoryCache();
      const results = [];
      for (let i = 1; i <= max + 1; i++)
        results.push(
          await hit(limiter, cache, PROXY, { "x-forwarded-for": inNetwork(i) }),
        );
      expect(results.at(-1)).toBe(429);
      expect(
        await hit(limiter, cache, PROXY, {
          "x-forwarded-for": "2001:db8:1:3::1",
        }),
      ).toBe("ok");
    });

  it("login: a /48 gets 300 attempts a minute however many /64s it spreads them over", async () => {
    const cache = memoryCache();
    const from = (address: string) =>
      hit(authRateLimiters.loginNetwork, cache, PROXY, {
        "x-forwarded-for": address,
      });
    const results = [];
    for (let i = 0; i <= 300; i++)
      results.push(await from(`2001:db8:ab:${i.toString(16)}::1`));
    expect(results.slice(0, 300).every((r) => r === "ok")).toBe(true);
    expect(results[300]).toBe(429);
    expect(await from("2001:db8:ac::1")).toBe("ok");
    expect(
      clientNetwork(
        new Request("http://localhost/", {
          headers: { "x-forwarded-for": CLIENT },
        }),
        socketOf(PROXY),
      ),
    ).toBe(CLIENT);
  });

  it("login: one /64 cannot spend its /48's allowance, since the address limit counts first", async () => {
    const cache = memoryCache();
    const attempt = async (address: string) => {
      const headers = { "x-forwarded-for": address };
      const ip = await hit(authRateLimiters.loginIp, cache, PROXY, headers);
      if (ip !== "ok") return ip;
      return hit(authRateLimiters.loginNetwork, cache, PROXY, headers);
    };
    for (let i = 0; i < 300; i++) await attempt("2001:db8:ab:1::1");
    expect(await attempt("2001:db8:ab:2::1")).toBe("ok");
  });

  it("login: one account gets five guesses per /64, not per address", async () => {
    const cache = memoryCache();
    const results = [];
    for (let i = 1; i <= 6; i++)
      results.push(
        await hit(
          authRateLimiters.login,
          cache,
          PROXY,
          { "x-forwarded-for": inNetwork(i) },
          { email: "someone@example.test" },
        ),
      );
    expect(results.at(-1)).toBe(429);
  });

  it("the per-route limiter: addresses in one /64 are one caller", () => {
    const limiter = createIpRateLimit(1);
    const from = (address: string) =>
      limiter({
        request: new Request("http://localhost/", {
          headers: { "x-forwarded-for": address },
        }),
        set: {},
        server: socketOf(PROXY),
      } as never);
    expect(from(inNetwork(1))).toBeUndefined();
    expect(from(inNetwork(2))).toBeDefined();
    expect(from("2001:db8:1:3::1")).toBeUndefined();
  });

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
    expect(bucket("1:2::3:4:5:6.7.8.9")).toBe("1:2:0:3::/64");
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
      const picked = [CLIENT, CLIENT, "", `192.0.2.1, ${CLIENT}`].map(
        (header) =>
          clientIp(
            new Request("http://localhost/", {
              headers: header ? { "x-forwarded-for": header } : {},
            }),
            socketOf(PROXY),
          ),
      );
      expect(picked).toEqual([CLIENT, CLIENT, PROXY, "192.0.2.1"]);
      const lines = errors.mock.calls.flat().join("\n");
      expect(lines.match(/carried \d+/g)).toEqual(["carried 1"]);
      expect(lines).toContain("no forwarded address");
      expect(lines).toContain("too high");
      expect(lines).not.toContain(CLIENT);
    } finally {
      errors.mockRestore();
    }
  });

  it("a health check without forwarded addresses does not hide a later short chain", () => {
    hops("2");
    forgetClientIpLogs();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const header of ["", CLIENT])
        clientIp(
          new Request("http://localhost/", {
            headers: header ? { "x-forwarded-for": header } : {},
          }),
          socketOf(PROXY),
        );
      expect(errors.mock.calls.flat().join("\n")).toContain("carried 1");
    } finally {
      errors.mockRestore();
    }
  });

  it("a chain exactly as long as the setting is not reported", () => {
    forgetClientIpLogs();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const [setting, header] of [
        ["1", CLIENT],
        ["2", `${CLIENT}, 192.0.2.1`],
      ]) {
        hops(setting);
        clientIp(
          new Request("http://localhost/", {
            headers: { "x-forwarded-for": header },
          }),
          socketOf(PROXY),
        );
      }
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("one proxy that appends nothing is reported, since every caller would share its address", () => {
    hops("1");
    forgetClientIpLogs();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (let i = 0; i < 3; i++)
        clientIp(new Request("http://localhost/"), socketOf(PROXY));
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls.flat().join(" ")).toContain(
        "no forwarded address",
      );
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

describe("each limiter keeps the window its policy names", () => {
  it("sign-in and SSO a minute, signup and password reset an hour", async () => {
    hops("1");
    const cache = recordingCache();
    for (const limiter of [
      authRateLimiters.login,
      authRateLimiters.loginIp,
      authRateLimiters.loginNetwork,
      authRateLimiters.sso,
      authRateLimiters.signup,
      authRateLimiters.forgotPassword,
    ])
      await hit(
        limiter,
        cache as never,
        CLIENT,
        {},
        { email: "a@example.test" },
      );
    expect(cache.windows).toEqual({
      login: 60,
      "login-ip": 60,
      "login-net": 60,
      sso: 60,
      signup: 3600,
      "forgot-password": 3600,
    });
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

  it("the forgot-password key is the email as typed, as before", async () => {
    const cache = recordingCache();
    for (const email of ["someone@example.test", "Someone@example.test"])
      await hit(
        authRateLimiters.forgotPassword,
        cache as never,
        CLIENT,
        {},
        {
          email,
        },
      );
    expect(cache.keys[0]).not.toBe(cache.keys[1]);
  });

  it("a wait that cannot be read leaves the refusal without one", async () => {
    for (const ttl of [
      () => Promise.reject(new Error("ttl failed")),
      async () => -2,
    ]) {
      const limiter = createRateLimit({
        windowSeconds: 60,
        max: 0,
        keyGenerator: () => "no-ttl",
      });
      let refusal: unknown;
      await limiter({
        request: new Request("http://localhost/"),
        store: { cache: { increment: async () => 1, ttl } },
        set: {},
      }).catch((e: unknown) => {
        refusal = e;
      });
      expect(refusal).toEqual({
        status: 429,
        message: "Too many requests, please try again later",
      });
    }
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
    expect(
      await hit(authRateLimiters.loginNetwork, down as never, CLIENT),
    ).toBe("ok");
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

describe("the confirmation email limit counts per account", () => {
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
