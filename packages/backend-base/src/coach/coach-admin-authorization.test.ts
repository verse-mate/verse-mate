import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { Value } from "@sinclair/typebox/value";
import { Elysia } from "elysia";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import coachPlugin from "./coach.plugin";

const USER = "admin-authz-user";
const app = new Elysia().use(coachPlugin);
const store = app.store as unknown as {
  coachService: unknown;
  notification: unknown;
};
const realService = store.coachService;
const realNotification = store.notification;

const IDENTITY_CHECKS = new Set(["isAdmin", "getMe", "isCoach"]);
let role: "admin" | "leader" = "leader";
let calls: string[] = [];
let token = "";

const stubService = new Proxy(
  {},
  {
    get: (_target, name) => {
      if (name === "then") return undefined;
      return async () => {
        calls.push(String(name));
        if (name === "isAdmin") return role === "admin";
        if (name === "isCoach") return true;
        if (name === "getMe")
          return {
            isCoach: true,
            isAdmin: role === "admin",
            profile: { id: "leader-a", name: "A", email: "a@example.test" },
          };
        return null;
      };
    },
  },
);

type RouteHooks = {
  body?: Parameters<typeof Value.Create>[0];
  query?: Parameters<typeof Value.Create>[0];
};

const adminRoutes = app.routes
  .filter((r) => r.path.startsWith("/coach/admin"))
  .map((r) => ({
    method: r.method,
    path: r.path,
    hooks: (r as unknown as { hooks?: RouteHooks }).hooks ?? {},
  }));

function request(
  route: (typeof adminRoutes)[number],
  authenticated: boolean,
): Request {
  const path = route.path.replace(/:[A-Za-z]+/g, "x");
  const query = route.hooks.query
    ? new URLSearchParams(
        Value.Create(route.hooks.query) as Record<string, string>,
      ).toString()
    : "";
  const headers: Record<string, string> = {};
  if (authenticated) headers.authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (route.hooks.body) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(Value.Create(route.hooks.body));
  }
  return new Request(`http://localhost${path}${query ? `?${query}` : ""}`, {
    method: route.method,
    headers,
    body,
  });
}

async function clearLimits() {
  await redisClient.delete(`rate-limit:coach:${USER}`);
  await redisClient.delete("rate-limit:coach:ip:unknown");
}

beforeAll(async () => {
  const signer = new Elysia().use(
    jwt({
      name: "jwt",
      secret: process.env.AUTH_ACCESS_TOKEN_SECRET as string,
    }),
  );
  token = await signer.decorator.jwt.sign({ sub: USER });
  await redisClient.set(cacheConstants.accessToken(USER), [token], "5m");
  store.coachService = stubService;
  store.notification = { sendEmail: async () => ({ delivered: true }) };
  await clearLimits();
});

afterAll(async () => {
  store.coachService = realService;
  store.notification = realNotification;
  await redisClient.set(cacheConstants.accessToken(USER), [], "1s");
  await clearLimits();
});

beforeEach(() => {
  calls = [];
});

describe("every admin route of the coach plugin is guarded", () => {
  it("the plugin's admin routes are enumerated from the plugin itself", () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(23);
  });

  it.each(adminRoutes.map((r) => [`${r.method} ${r.path}`, r] as const))(
    "%s refuses an unauthenticated caller and does no work",
    async (_name, route) => {
      const res = await app.handle(request(route, false));
      expect(res.status).toBe(401);
      expect(calls).toEqual([]);
    },
  );

  it.each(adminRoutes.map((r) => [`${r.method} ${r.path}`, r] as const))(
    "%s refuses a signed-in leader who is not an admin and does no work",
    async (_name, route) => {
      role = "leader";
      const res = await app.handle(request(route, true));
      expect(res.status).toBe(403);
      expect(calls.filter((c) => !IDENTITY_CHECKS.has(c))).toEqual([]);
    },
  );

  it.each(adminRoutes.map((r) => [`${r.method} ${r.path}`, r] as const))(
    "%s lets an admin past the guard",
    async (_name, route) => {
      role = "admin";
      const res = await app.handle(request(route, true));
      expect([401, 403]).not.toContain(res.status);
      expect(calls).toContain("isAdmin");
    },
  );
});
