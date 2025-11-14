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

      if (!data) throw new Error("Data should not be null");
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

  describe("Auto-Highlights Administration", () => {
    let testThemeId: number;

    it("GET /admin/highlight-themes/all - admin can get all themes", async () => {
      const { data, error } = await testClient.admin[
        "highlight-themes"
      ].all.get({
        headers: {
          authorization: `Bearer ${adminUser.accessToken}`,
        },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(6);

      if (data && data.length > 0) {
        expect(data[0]).toHaveProperty("theme_id");
        expect(data[0]).toHaveProperty("name");
        expect(data[0]).toHaveProperty("color");
        expect(data[0]).toHaveProperty("is_active");
        testThemeId = data[0].theme_id;
      }
    });

    it("GET /admin/highlight-themes/all - non-admin cannot access", async () => {
      const { error, status } = await testClient.admin[
        "highlight-themes"
      ].all.get({
        headers: {
          authorization: `Bearer ${regularUser.accessToken}`,
        },
      });

      expect(error).toBeTruthy();
      expect([403, 422]).toContain(status);
    });

    it("PATCH /admin/highlight-themes/:theme_id - admin can toggle theme status", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.admin["highlight-themes"][
        testThemeId
      ].patch(
        {
          is_active: false,
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

      // Verify the change
      const { data: themes } = await testClient.admin[
        "highlight-themes"
      ].all.get({
        headers: {
          authorization: `Bearer ${adminUser.accessToken}`,
        },
      });

      const updated = themes?.find((t: any) => t.theme_id === testThemeId);
      expect(updated?.is_active).toBe(false);

      // Revert
      // @ts-ignore - Dynamic path parameter
      await testClient.admin["highlight-themes"][testThemeId].patch(
        {
          is_active: true,
        },
        {
          headers: {
            authorization: `Bearer ${adminUser.accessToken}`,
          },
        },
      );
    });

    it("PATCH /admin/highlight-themes/:theme_id - non-admin cannot toggle", async () => {
      // @ts-ignore - Dynamic path parameter
      const { error, status } = await testClient.admin["highlight-themes"][
        testThemeId
      ].patch(
        {
          is_active: false,
        },
        {
          headers: {
            authorization: `Bearer ${regularUser.accessToken}`,
          },
        },
      );

      expect(error).toBeTruthy();
      expect([403, 422]).toContain(status);
    });

    it("GET /admin/auto-highlight-settings/default-relevance - admin can get default relevance", async () => {
      const { data, error } = await testClient.admin["auto-highlight-settings"][
        "default-relevance"
      ].get({
        headers: {
          authorization: `Bearer ${adminUser.accessToken}`,
        },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
      expect(data?.data?.default_relevance).toBeDefined();
      expect(typeof data?.data?.default_relevance).toBe("number");
      expect(data?.data?.default_relevance).toBeGreaterThanOrEqual(1);
      expect(data?.data?.default_relevance).toBeLessThanOrEqual(5);
    });

    it("PATCH /admin/auto-highlight-settings/default-relevance - admin can update default relevance", async () => {
      const { data, error } = await testClient.admin["auto-highlight-settings"][
        "default-relevance"
      ].patch(
        {
          default_relevance: 4,
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

      // Verify the change
      const { data: settings } = await testClient.admin[
        "auto-highlight-settings"
      ]["default-relevance"].get({
        headers: {
          authorization: `Bearer ${adminUser.accessToken}`,
        },
      });

      expect(settings?.data?.default_relevance).toBe(4);

      // Reset to default
      await testClient.admin["auto-highlight-settings"][
        "default-relevance"
      ].patch(
        {
          default_relevance: 3,
        },
        {
          headers: {
            authorization: `Bearer ${adminUser.accessToken}`,
          },
        },
      );
    });

    it("PATCH /admin/auto-highlight-settings/default-relevance - non-admin cannot update", async () => {
      const { error, status } = await testClient.admin[
        "auto-highlight-settings"
      ]["default-relevance"].patch(
        {
          default_relevance: 2,
        },
        {
          headers: {
            authorization: `Bearer ${regularUser.accessToken}`,
          },
        },
      );

      expect(error).toBeTruthy();
      expect([403, 422]).toContain(status);
    });

    it("POST /admin/batch-auto-highlights - admin can create batch", async () => {
      const { data, error } = await testClient.admin[
        "batch-auto-highlights"
      ].post(
        {
          type: "book",
          model: "gpt-4o-mini",
          effort: "low",
          bookName: "Philemon", // Small book for testing
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
      expect(data?.data).toBeDefined();
      // Should have book_batch_id since we specified a book
      expect(data?.data?.book_batch_id).toBeDefined();
    });

    it("POST /admin/batch-auto-highlights - non-admin cannot create batch", async () => {
      const { error, status } = await testClient.admin[
        "batch-auto-highlights"
      ].post(
        {
          type: "book",
          model: "gpt-4o-mini",
          effort: "low",
          bookName: "Philemon",
        },
        {
          headers: {
            authorization: `Bearer ${regularUser.accessToken}`,
          },
        },
      );

      expect(error).toBeTruthy();
      expect([403, 422]).toContain(status);
    });
  });
});
