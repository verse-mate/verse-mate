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
import redisClient from "../shared/redis-client";
import versionPolicyPlugin from "../versionPolicy.plugin";

const FORWARDED = "198.51.100.23";

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
      "login",
      "sso",
    ]);
    for (const key of got) {
      expect(key).not.toEndWith(":unknown");
      expect(key).not.toContain(FORWARDED);
    }
  });

  it("TRUSTED_PROXY_HOPS=1 without a forwarded address: the socket, not a shared unknown bucket", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const got = await limiterKeys();
    expect(got).toHaveLength(4);
    for (const key of got) expect(key).not.toEndWith(":unknown");
  });

  it("TRUSTED_PROXY_HOPS=1: the address the proxy appended", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const got = await limiterKeys(`203.0.113.1, ${FORWARDED}`);
    expect(got).toHaveLength(4);
    for (const key of got) expect(key).toEndWith(`:${FORWARDED}`);
  });

  it("TRUSTED_PROXY_HOPS=0: the per-route limiter counts one socket as one caller", async () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    const statuses: number[] = [];
    for (let i = 0; i < 101; i++) {
      const response = await fetch(`${base()}/api/version-policy`, {
        headers: { "x-forwarded-for": `198.51.100.${i % 250}` },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 100).every((s) => s === 200)).toBe(true);
    expect(statuses[100]).toBe(429);
  });
});
