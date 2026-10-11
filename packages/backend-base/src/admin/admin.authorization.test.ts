import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import authPlugin from "../auth/auth.plugin";
import { createTestUser } from "../shared/test-helpers";
import userPlugin from "../user/user.plugin";
import Backend from "./admin.plugin";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe("Routes that read other users stay behind the admin check", () => {
  const plugin = Backend.use(userPlugin).use(authPlugin);
  let admin: TestUser;
  let regular: TestUser;
  let target: TestUser;

  const call = async (
    method: string,
    path: string,
    options: { token?: string; body?: unknown } = {},
  ) => {
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    const response = await plugin.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
    const text = await response.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: response.status, json };
  };

  beforeAll(async () => {
    admin = await createTestUser({ isAdmin: true });
    regular = await createTestUser();
    target = await createTestUser();
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  const adminOnlyRoutes = () => [
    { method: "GET", path: "/user" },
    { method: "GET", path: "/admin/users" },
    {
      method: "GET",
      path: `/admin/user-theme-preferences/${target.userId}`,
    },
    {
      method: "PATCH",
      path: `/admin/user-theme-preferences/${target.userId}/1`,
      body: { is_enabled: false },
    },
    { method: "GET", path: "/admin/explanations/audio" },
    { method: "GET", path: "/admin/daily-verses" },
    { method: "GET", path: "/admin/topics" },
  ];

  it("refuse a caller with no token", async () => {
    for (const route of adminOnlyRoutes()) {
      const res = await call(route.method, route.path, { body: route.body });
      expect({ route: route.path, status: res.status }).toEqual({
        route: route.path,
        status: 401,
      });
    }
  });

  it("refuse a signed-in user who is not an admin", async () => {
    for (const route of adminOnlyRoutes()) {
      const res = await call(route.method, route.path, {
        token: regular.accessToken,
        body: route.body,
      });
      expect({ route: route.path, status: res.status }).toEqual({
        route: route.path,
        status: 403,
      });
      expect(JSON.stringify(res.json)).not.toContain(target.email);
    }
  });

  it("let an admin read another user's data", async () => {
    const users = await call("GET", "/user", { token: admin.accessToken });
    expect(users.status).toBe(200);
    expect(
      (users.json as Array<{ email: string }>).some(
        (u) => u.email === target.email,
      ),
    ).toBe(true);

    const prefs = await call(
      "GET",
      `/admin/user-theme-preferences/${target.userId}`,
      { token: admin.accessToken },
    );
    expect(prefs.status).toBe(200);
    expect(prefs.json.success).toBe(true);
  });

  it("still answer a signed-in user's own profile", async () => {
    const me = await call("GET", "/user/me", { token: regular.accessToken });
    expect(me.status).toBe(200);
    expect(me.json.email).toBe(regular.email);
  });
});
