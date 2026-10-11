import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { Elysia } from "elysia";
import { adminGuard } from "../auth/admin.utils";
import authPlugin from "../auth/auth.plugin";
import shared from "../shared/shared.plugin";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./admin.plugin";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe("Routes that read other users stay behind the admin check", () => {
  const plugin = Backend.use(authPlugin);
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
    const users = await call("GET", "/admin/users", {
      token: admin.accessToken,
    });
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

  it("adminGuard on its own refuses a logged-out admin token", async () => {
    const probe = new Elysia()
      .use(shared)
      .guard(adminGuard, (app) => app.get("/admin-probe", () => "ok"));
    const loggedOut = await createTestUser({ isAdmin: true });

    const before = await probe.handle(
      new Request("http://localhost/admin-probe", {
        headers: { authorization: `Bearer ${loggedOut.accessToken}` },
      }),
    );
    expect(before.status).toBe(200);

    const logout = await call("POST", "/auth/logout", {
      token: loggedOut.accessToken,
    });
    expect(logout.status).toBe(200);

    const after = await probe.handle(
      new Request("http://localhost/admin-probe", {
        headers: { authorization: `Bearer ${loggedOut.accessToken}` },
      }),
    );
    expect(after.status).toBe(401);
  });
});
