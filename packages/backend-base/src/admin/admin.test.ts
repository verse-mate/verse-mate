import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import authPlugin from "../auth/auth.plugin";
import { getTestClient } from "../shared/test-client";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./admin.plugin";

describe("Admin Plugin", () => {
  let adminUser: Awaited<ReturnType<typeof createTestUser>>;
  let regularUser: Awaited<ReturnType<typeof createTestUser>>;
  const plugin = Backend.use(authPlugin);
  // @ts-ignore - Combined plugin types
  const testClient = getTestClient<typeof plugin>(plugin);

  beforeAll(async () => {
    adminUser = await createTestUser({ isAdmin: true });
    regularUser = await createTestUser({ isAdmin: false });
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  describe("User Management", () => {
    it("GET /admin/users - admin can list all users", async () => {
      const { data, error } = await testClient.admin.users.get({
        headers: {
          authorization: `Bearer ${adminUser.accessToken}`,
        },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      // Verify user structure
      const user = data[0];
      expect(user.id).toBeDefined();
      expect(user.email).toBeDefined();
      expect(user.firstName).toBeDefined();
      expect(user.lastName).toBeDefined();
      expect(user.is_admin).toBeDefined();
    });

    it("GET /admin/users - non-admin cannot list users", async () => {
      const { error, status } = await testClient.admin.users.get({
        headers: {
          authorization: `Bearer ${regularUser.accessToken}`,
        },
      });

      expect(error).toBeTruthy();
      expect([403, 422]).toContain(status); // Forbidden or validation error
    });

    it("PATCH /admin/user/:id/admin-status - admin can change user admin status", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.admin.user[regularUser.userId][
        "admin-status"
      ].patch(
        {
          is_admin: true,
        },
        {
          headers: {
            authorization: `Bearer ${adminUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
      expect(data?.message).toContain(regularUser.userId);

      // Revert the change
      // @ts-ignore - Dynamic path parameter
      await testClient.admin.user[regularUser.userId]["admin-status"].patch(
        {
          is_admin: false,
        },
        {
          headers: {
            authorization: `Bearer ${adminUser.accessToken}`,
          },
        },
      );
    });

    it("PATCH /admin/user/:id/admin-status - non-admin cannot change admin status", async () => {
      // @ts-ignore - Dynamic path parameter
      const { error, status } = await testClient.admin.user[regularUser.userId][
        "admin-status"
      ].patch(
        {
          is_admin: true,
        },
        {
          headers: {
            authorization: `Bearer ${regularUser.accessToken}`,
          },
        },
      );

      expect(error).toBeTruthy();
      expect([403, 422]).toContain(status); // Forbidden or validation error
    });
  });

  describe("Explanation Languages", () => {
    it("GET /admin/explanations/languages - admin can get language list", async () => {
      const { data, error } = await testClient.admin.explanations.languages.get(
        {
          headers: {
            authorization: `Bearer ${adminUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /admin/explanations/languages - non-admin cannot access", async () => {
      const { error, status } =
        await testClient.admin.explanations.languages.get({
          headers: {
            authorization: `Bearer ${regularUser.accessToken}`,
          },
        });

      expect(error).toBeTruthy();
      expect([403, 422]).toContain(status); // Forbidden or validation error
    });
  });
});
