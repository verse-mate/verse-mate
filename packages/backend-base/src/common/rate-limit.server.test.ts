import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import { db as Database } from "database";
import { Elysia } from "elysia";

import authPlugin from "../auth/auth.plugin";
import { createIpRateLimit } from "../middleware/rate-limit";
import redisClient from "../shared/redis-client";
import versionPolicyPlugin from "../versionPolicy.plugin";
import { authRateLimiters } from "./rate-limit.middleware";

const FORWARDED = "198.51.100.23";
const LOOPBACK = /:(127\.0\.0\.1|::1|0:0:0:0::\/64|0:0:0::\/48)$/;

function expectKeys(keys: string[], address: RegExp) {
  for (const key of keys) expect(key).toMatch(address);
}

describe("on a listening server, every limiter reads the socket, whatever the route handler names", () => {
  const keys: string[] = [];
  const emails: string[] = [];
  const savedHops = process.env.TRUSTED_PROXY_HOPS;
  let increment: ReturnType<typeof spyOn>;
  let sendEmail: ReturnType<typeof spyOn>;

  const app = new Elysia().use(authPlugin).use(versionPolicyPlugin);
  const base = () => `http://localhost:${app.server?.port}`;

  const post = (path: string, body: unknown, forwarded?: string) =>
    fetch(`${base()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
      },
      body: JSON.stringify(body),
    });

  async function limiterKeys(forwarded?: string) {
    keys.length = 0;
    const email = `limits-${crypto.randomUUID()}@example.test`;
    emails.push(email);
    await post(
      "/auth/signup",
      { email, firstName: "Ada", lastName: "Byron", password: "Passw0rd!x" },
      forwarded,
    );
    await post(
      "/auth/login",
      { email: `nobody-${crypto.randomUUID()}@example.test`, password: "x" },
      forwarded,
    );
    await post(
      "/auth/sso",
      { provider: "google", token: "not-a-token", platform: "mobile" },
      forwarded,
    );
    return [...keys];
  }

  beforeAll(() => {
    increment = spyOn(redisClient, "increment").mockImplementation(
      async (key: string) => {
        keys.push(key);
        return 1;
      },
    );
    sendEmail = spyOn(
      authPlugin.store.notification,
      "sendEmail",
    ).mockImplementation(() => Promise.resolve({ delivered: true }));
    app.listen(0);
  });

  afterEach(() => {
    if (savedHops === undefined)
      Reflect.deleteProperty(process.env, "TRUSTED_PROXY_HOPS");
    else process.env.TRUSTED_PROXY_HOPS = savedHops;
  });

  afterAll(async () => {
    app.server?.stop(true);
    increment.mockRestore();
    sendEmail.mockRestore();
    if (emails.length)
      await Database.getOrCreateConnection()
        .deleteFrom("user")
        .where("email", "in", emails)
        .execute();
  });

  it("TRUSTED_PROXY_HOPS=0: signup, login and SSO key on the socket and ignore X-Forwarded-For", async () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    const got = await limiterKeys(FORWARDED);
    expect(got.map((k) => k.split(":")[1])).toEqual([
      "signup",
      "login-ip",
      "login-net",
      "login",
      "sso",
    ]);
    expectKeys(got, LOOPBACK);
  });

  it("TRUSTED_PROXY_HOPS=1 without a forwarded address: the socket, not a shared unknown bucket", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const got = await limiterKeys();
    expect(got).toHaveLength(5);
    expectKeys(got, LOOPBACK);
  });

  it("TRUSTED_PROXY_HOPS=1: the address the proxy appended", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const got = await limiterKeys(`203.0.113.1, ${FORWARDED}`);
    expect(got).toHaveLength(5);
    expectKeys(got, new RegExp(`:${FORWARDED.replaceAll(".", "\\.")}$`));
  });

  it("the per-route limiter reads the socket too, so callers without one never share its bucket", async () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    const limiter = createIpRateLimit(1);
    const route = new Elysia()
      .get("/per-route", () => "ok", { beforeHandle: limiter })
      .listen(0);
    try {
      limiter({
        request: new Request("http://localhost/per-route"),
        set: { headers: {} },
      } as never);
      const response = await fetch(
        `http://localhost:${route.server?.port}/per-route`,
      );
      expect(response.status).toBe(200);
    } finally {
      route.server?.stop(true);
    }
  });

  it("the login route counts the address before the network", () => {
    const login = authPlugin.routes.find(
      (route) => route.path === "/auth/login" && route.method === "POST",
    ) as unknown as { hooks: { beforeHandle: { fn: unknown }[] } };
    expect(login.hooks.beforeHandle.map((hook) => hook.fn)).toEqual([
      authRateLimiters.loginIp,
      authRateLimiters.loginNetwork,
      authRateLimiters.login,
    ]);
  });

  it("an email longer than the column is refused before any limiter or lookup, and the report carries no body", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const sized = (length: number) =>
      `${"a".repeat(length - "@example.test".length)}@example.test`;
    const bodies = (email: string) =>
      [
        ["/auth/login", { email, password: "x" }],
        ["/auth/forgot-password", { email }],
        [
          "/auth/signup",
          { email, firstName: "A", lastName: "B", password: "Passw0rd!x" },
        ],
      ] as const;
    keys.length = 0;
    const errors = spyOn(console, "error").mockImplementation(() => {});
    let reported = "";
    try {
      for (const [path, body] of bodies(sized(251)))
        expect((await post(path, body)).status).toBe(422);
      reported = errors.mock.calls.map((call) => Bun.inspect(call)).join("\n");
    } finally {
      errors.mockRestore();
    }
    expect(reported).toContain("validation failed on body");
    expect(reported).not.toContain("example.test");
    expect(reported).not.toContain("Passw0rd");
    expect(keys).toEqual([]);
    const fits = sized(250);
    emails.push(fits);
    let accessToken = "";
    for (const [path, body] of bodies(fits)) {
      const response = await post(path, body);
      expect(response.status).not.toBe(422);
      if (path === "/auth/signup")
        accessToken = ((await response.json()) as { accessToken: string })
          .accessToken;
    }
    const profile = (email: string) =>
      fetch(`${base()}/auth/profile`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email }),
      });
    expect((await profile(sized(251))).status).toBe(422);
    const renamed = sized(250).replace(/^a/, "b");
    emails.push(renamed);
    expect((await profile(renamed)).status).not.toBe(422);
  });

  it("the login handler passes the socket address on as the session address", async () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    const login = spyOn(authPlugin.store.authService, "login");
    try {
      await post(
        "/auth/login",
        { email: `nobody-${crypto.randomUUID()}@example.test`, password: "x" },
        FORWARDED,
      );
      expect(login.mock.calls[0]?.[3]).toMatch(/^(127\.0\.0\.1|::1)$/);
    } finally {
      login.mockRestore();
    }
  });
});
