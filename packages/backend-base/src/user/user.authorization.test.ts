import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import authPlugin from "../auth/auth.plugin";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./user.plugin";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

describe("GET /user lists every account to admins only", () => {
  const plugin = new Elysia().use(Backend).use(authPlugin);
  let admin: TestUser;
  let regular: TestUser;

  const get = async (path: string, token?: string) => {
    const response = await plugin.handle(
      new Request(`http://localhost${path}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
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
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  it("refuses a caller with no token", async () => {
    expect((await get("/user")).status).toBe(401);
  });

  it("refuses a signed-in user who is not an admin", async () => {
    const res = await get("/user", regular.accessToken);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.json)).not.toContain(admin.email);
  });

  it("answers an admin", async () => {
    const res = await get("/user", admin.accessToken);
    expect(res.status).toBe(200);
    expect(
      (res.json as Array<{ email: string }>).some(
        (u) => u.email === regular.email,
      ),
    ).toBe(true);
  });

  it("still answers a signed-in user's own profile", async () => {
    const res = await get("/user/me", regular.accessToken);
    expect(res.status).toBe(200);
    expect(res.json.email).toBe(regular.email);
  });
});
