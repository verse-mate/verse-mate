import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import PromptStatusEnum from "database/src/models/public/PromptStatusEnum";

import authPlugin from "../auth/auth.plugin";
import { resetAiProviderCache } from "../shared/ai";
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
      expect(data?.success).toBe(true);
      const themes = data?.data ?? [];
      expect(themes.length).toBeGreaterThanOrEqual(6);
      expect(themes[0]).toHaveProperty("theme_id");
      expect(themes[0]).toHaveProperty("name");
      expect(themes[0]).toHaveProperty("color");
      expect(themes[0]).toHaveProperty("is_active");
      testThemeId = themes[0].theme_id;
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

      const updated = themes?.data?.find(
        (t: any) => t.theme_id === testThemeId,
      );
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
      const db = Backend.store.db.getOrCreateConnection();
      const existingPrompt = await db
        .selectFrom("prompts")
        .select(["prompt_id", "status"])
        .where("prompt_type", "=", "auto-highlight")
        .executeTakeFirst();
      const seededPrompt = existingPrompt
        ? undefined
        : await db
            .insertInto("prompts")
            .values({
              prompt: "Highlight the themes of {book_name}.",
              status: PromptStatusEnum.active,
              prompt_type: "auto-highlight",
            })
            .returning("prompt_id")
            .executeTakeFirstOrThrow();
      if (existingPrompt)
        await db
          .updateTable("prompts")
          .set({ status: PromptStatusEnum.active })
          .where("prompt_id", "=", existingPrompt.prompt_id)
          .execute();
      const enqueue = spyOn(
        Backend.store.batchMonitoringQueue,
        "add",
      ).mockResolvedValue({} as any);
      const aiProvider = process.env.AI_PROVIDER;
      process.env.AI_PROVIDER = "stub";
      resetAiProviderCache();
      let batchId: string | undefined;

      try {
        const { data, error } = await testClient.admin[
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
              authorization: `Bearer ${adminUser.accessToken}`,
            },
          },
        );

        expect(error).toBeFalsy();
        expect(data?.success).toBe(true);
        batchId = data?.data?.id;
        expect(batchId).toBeTruthy();

        const job = await db
          .selectFrom("batch_jobs")
          .innerJoin("books", "books.book_id", "batch_jobs.book_id")
          .select(["batch_jobs.batch_type", "books.name", "batch_jobs.status"])
          .where("batch_jobs.openai_batch_id", "=", batchId ?? "")
          .where("batch_jobs.created_by", "=", adminUser.userId)
          .executeTakeFirst();
        expect(job).toEqual({
          batch_type: "auto-highlight",
          name: "Philemon",
          status: "validating",
        });
        expect(enqueue).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ batchId }),
          expect.objectContaining({ jobId: batchId }),
        );
      } finally {
        enqueue.mockRestore();
        await db
          .deleteFrom("batch_jobs")
          .where("created_by", "=", adminUser.userId)
          .where("batch_type", "=", "auto-highlight")
          .execute();
        if (seededPrompt)
          await db
            .deleteFrom("prompts")
            .where("prompt_id", "=", seededPrompt.prompt_id)
            .execute();
        if (existingPrompt)
          await db
            .updateTable("prompts")
            .set({ status: existingPrompt.status })
            .where("prompt_id", "=", existingPrompt.prompt_id)
            .execute();
        if (aiProvider === undefined)
          Reflect.deleteProperty(process.env, "AI_PROVIDER");
        else process.env.AI_PROVIDER = aiProvider;
        resetAiProviderCache();
      }
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

  describe("User preferences", () => {
    const storedLanguage = async (userId: string) =>
      (
        await Backend.store.db
          .getOrCreateConnection()
          .selectFrom("user")
          .where("id", "=", userId)
          .select("preferred_language")
          .executeTakeFirstOrThrow()
      ).preferred_language;

    it("PATCH /user/preferences stores a well-formed language code", async () => {
      const { error, status } = await testClient.user.preferences.patch(
        { preferred_language: "pt-BR" },
        { headers: { authorization: `Bearer ${regularUser.accessToken}` } },
      );

      expect(error).toBeFalsy();
      expect(status).toBe(200);
      expect(await storedLanguage(regularUser.userId)).toBe("pt-BR");
    });

    it.each(["pt-BR'", "en OR 1", "", "x"])(
      "PATCH /user/preferences refuses %p with 400 and keeps the stored code",
      async (code) => {
        const { status } = await testClient.user.preferences.patch(
          { preferred_language: code },
          { headers: { authorization: `Bearer ${regularUser.accessToken}` } },
        );

        expect(status).toBe(400);
        expect(await storedLanguage(regularUser.userId)).toBe("pt-BR");
      },
    );
  });
});
