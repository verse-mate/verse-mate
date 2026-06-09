import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";

import authPlugin from "../auth/auth.plugin";
import { getTestClient } from "../shared/test-client";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./admin.plugin";

/**
 * Integration coverage for the admin Verse-of-the-Day CRUD endpoints
 * (`/admin/daily-verses` + `/admin/daily-verse-tags`). Runs against the CI
 * test database, which is seeded with the NASB1995 baseline. Mirrors the
 * harness used by admin.test.ts (Eden Treaty client + createTestUser).
 *
 * Covers (Task 8.2):
 *  - CRUD happy path (create -> get/list -> update -> delete)
 *  - adminGuard rejects anonymous + non-admin callers
 *  - write-path validation rejections (missing-in-NASB-baseline,
 *    cross-chapter / out-of-range verse, unknown tag id)
 *  - a write triggers today's-pick cache invalidation
 */
describe("Admin Daily Verse Plugin (integration)", () => {
  let adminUser: Awaited<ReturnType<typeof createTestUser>>;
  let regularUser: Awaited<ReturnType<typeof createTestUser>>;
  const plugin = Backend.use(authPlugin);
  // @ts-ignore - Combined plugin types
  const testClient = getTestClient<typeof plugin>(plugin);

  const adminAuth = () => ({
    headers: { authorization: `Bearer ${adminUser.accessToken}` },
  });

  beforeAll(async () => {
    adminUser = await createTestUser({ isAdmin: true });
    regularUser = await createTestUser({ isAdmin: false });
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  // Genesis 1:1 — present in the seeded NASB1995 baseline, so it passes the
  // D-29 baseline-existence check.
  const validVerse = {
    book_id: 1,
    chapter_number: 1,
    verse_start: 1,
    verse_end: 2,
  };

  describe("CRUD happy path", () => {
    let createdId: string;

    it("POST /admin/daily-verses - admin can create a curated verse", async () => {
      const { data, error } = await testClient.admin["daily-verses"].post(
        { ...validVerse, note: "test verse", is_active: true },
        adminAuth(),
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      if (!data) throw new Error("expected a created verse");
      expect(data.verse.id).toBeDefined();
      expect(data.verse.book_id).toBe(validVerse.book_id);
      // Date fields must be serialized to ISO strings (S-002), not Date objects.
      if (data.verse.created_at !== null) {
        expect(typeof data.verse.created_at).toBe("string");
      }
      createdId = data.verse.id;
    });

    it("GET /admin/daily-verses - admin can list created verses", async () => {
      const { data, error } = await testClient.admin["daily-verses"].get(
        adminAuth(),
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      if (!data) throw new Error("expected a list");
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe("number");
      expect(data.items.some((v: any) => v.id === createdId)).toBe(true);
    });

    it("PUT /admin/daily-verses/:id - admin can update the verse", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.admin["daily-verses"][
        createdId
      ].put({ note: "updated note" }, adminAuth());

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.verse.id).toBe(createdId);
      expect(data?.verse.note).toBe("updated note");
    });

    it("DELETE /admin/daily-verses/:id - admin can (soft) delete the verse", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.admin["daily-verses"][
        createdId
      ].delete(undefined, adminAuth());

      expect(error).toBeFalsy();
      expect(data?.success).toBe(true);
    });
  });

  describe("adminGuard", () => {
    it("rejects an anonymous caller", async () => {
      const { error, status } = await testClient.admin["daily-verses"].get({});
      expect(error).toBeTruthy();
      expect([401, 403, 422]).toContain(status);
    });

    it("rejects a non-admin caller", async () => {
      const { error, status } = await testClient.admin["daily-verses"].get({
        headers: { authorization: `Bearer ${regularUser.accessToken}` },
      });
      expect(error).toBeTruthy();
      expect([401, 403, 422]).toContain(status);
    });

    it("rejects a non-admin write", async () => {
      const { error, status } = await testClient.admin["daily-verses"].post(
        validVerse,
        { headers: { authorization: `Bearer ${regularUser.accessToken}` } },
      );
      expect(error).toBeTruthy();
      expect([401, 403, 422]).toContain(status);
    });
  });

  describe("write-path validation", () => {
    it("rejects a verse not present in the NASB1995 baseline (D-29)", async () => {
      // Genesis 1 has 31 verses; verse 999 cannot render in the baseline.
      const { error } = await testClient.admin["daily-verses"].post(
        { book_id: 1, chapter_number: 1, verse_start: 999, verse_end: 999 },
        adminAuth(),
      );
      expect(error).toBeTruthy();
    });

    it("rejects an out-of-range / cross-chapter verse range (D-33)", async () => {
      // A range whose end overruns the chapter cannot fully render in the
      // baseline, so the same-chapter / valid-range rule rejects it.
      const { error } = await testClient.admin["daily-verses"].post(
        { book_id: 1, chapter_number: 1, verse_start: 1, verse_end: 999 },
        adminAuth(),
      );
      expect(error).toBeTruthy();
    });

    it("rejects an unknown tag id (D-27)", async () => {
      const { error } = await testClient.admin["daily-verses"].post(
        {
          ...validVerse,
          tag_ids: ["00000000-0000-0000-0000-000000000000"],
        },
        adminAuth(),
      );
      expect(error).toBeTruthy();
    });
  });

  describe("cache invalidation", () => {
    it("a successful write invalidates today's pick cache (D-26 / D-39)", async () => {
      const invalidateSpy = spyOn(
        Backend.store.dailyVerseService,
        "invalidatePickForToday",
      );

      const { error } = await testClient.admin["daily-verses"].post(
        { ...validVerse, note: "cache-invalidation probe" },
        adminAuth(),
      );

      expect(error).toBeFalsy();
      expect(invalidateSpy).toHaveBeenCalled();
      invalidateSpy.mockRestore();
    });
  });
});
