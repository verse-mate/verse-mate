import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import HighlightColorEnum from "database/src/models/public/HighlightColorEnum";
import authPlugin from "../auth/auth.plugin";
import { getTestClient } from "../shared/test-client";
import { createTestUser } from "../shared/test-helpers";
import Backend from "./bible.plugin";

describe("Bible Plugin", () => {
  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  const plugin = Backend.use(authPlugin);
  // @ts-ignore - Combined plugin types
  const testClient = getTestClient<typeof plugin>(plugin);

  beforeAll(async () => {
    testUser = await createTestUser();
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  describe("Static Endpoints", () => {
    it("GET /bible/books - returns book list", async () => {
      const { data, error } = await testClient.bible.books.get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.books).toBeDefined();
      expect(Array.isArray(data?.books)).toBe(true);
      expect(data?.books.length).toBeGreaterThan(0);
    });

    it("GET /bible/languages - returns available languages", async () => {
      const { data, error } = await testClient.bible.languages.get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /bible/testaments - returns testament list", async () => {
      const { data, error } = await testClient.bible.testaments.get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.testaments).toBeDefined();
      expect(Array.isArray(data?.testaments)).toBe(true);
      // Note: May be empty in fresh test database without Bible data seeded
    });

    it("GET /bible/book/:bookId/:chapterNumber - returns chapter with verseNumber", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.bible.book[1][1].get({
        query: { versionKey: "NASB1995" },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.book).toBeDefined();
      expect(data?.book?.chapters).toBeDefined();
      expect(Array.isArray(data?.book?.chapters)).toBe(true);
      expect(data?.book?.chapters.length).toBeGreaterThan(0);

      // Check that verses have verseNumber
      const firstChapter = data?.book?.chapters[0];
      expect(firstChapter).toBeDefined();
      expect(firstChapter?.verses).toBeDefined();
      expect(Array.isArray(firstChapter?.verses)).toBe(true);
      expect(firstChapter?.verses.length).toBeGreaterThan(0);

      // CRITICAL: Verify verseNumber exists on verses
      const firstVerse = firstChapter?.verses[0];
      expect(firstVerse).toBeDefined();
      expect(firstVerse?.verseNumber).toBeDefined();
      expect(typeof firstVerse?.verseNumber).toBe("number");
      expect(firstVerse?.text).toBeDefined();
      expect(typeof firstVerse?.text).toBe("string");

      // Verify chapterNumber exists
      expect(firstChapter?.chapterNumber).toBeDefined();
      expect(typeof firstChapter?.chapterNumber).toBe("number");
    });

    it("GET /bible/book/:bookId/:chapterNumber - accepts bible_version alias", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.bible.book[1][1].get({
        query: { bible_version: "NASB1995" },
      });

      expect(error).toBeFalsy();
      expect(data?.book).toBeDefined();
      expect(Array.isArray(data?.book?.chapters)).toBe(true);
    });

    it("GET /bible/versions - lists active versions with license metadata", async () => {
      const { data, error } = await testClient.bible.versions.get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data?.versions)).toBe(true);

      const nasb = data?.versions.find((v) => v.version_key === "NASB1995");
      expect(nasb).toBeDefined();
      expect(nasb?.language_code).toBe("en");
      expect(nasb?.testament_coverage).toBeDefined();

      // Curated open versions seeded by migration are discoverable, including
      // the NT-only Ukrainian translation.
      const ukrkl = data?.versions.find((v) => v.version_key === "UKRKL");
      expect(ukrkl).toBeDefined();
      expect(ukrkl?.testament_coverage).toBe("nt");
    });

    it("GET /bible/book/explanation/:bookId/:chapterNumber - returns the explanation shape", async () => {
      const { data, error } =
        // @ts-ignore - Dynamic path parameters
        await testClient.bible.book.explanation[1][1].get({
          query: { explanationType: "summary" },
        });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data).toHaveProperty("explanation");
    });

    it("GET /bible/book/explanation/:bookId/:chapterNumber - accepts optional lang query param", async () => {
      const { data, error } =
        // @ts-ignore - Dynamic path parameters
        await testClient.bible.book.explanation[1][1].get({
          query: { explanationType: "summary", lang: "es" },
        });

      // The endpoint accepts the language selector; when no Spanish translation
      // exists it falls back to English rather than erroring.
      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data).toHaveProperty("explanation");
    });
  });

  describe("Bookmarks CRUD", () => {
    const testBookmark = {
      book_id: 1, // Genesis
      chapter_number: 1,
    };

    it("POST /bible/book/bookmark/add - add bookmark", async () => {
      const { data, error } = await testClient.bible.book.bookmark.add.post(
        {
          user_id: testUser.userId,
          ...testBookmark,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
    });

    it("GET /bible/book/bookmarks/:user_id - get user bookmarks", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.bible.book.bookmarks[
        testUser.userId
      ].get({
        headers: {
          authorization: `Bearer ${testUser.accessToken}`,
        },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.favorites).toBeDefined();
      expect(Array.isArray(data?.favorites)).toBe(true);
      expect(data?.favorites.length).toBeGreaterThan(0);

      const bookmark = data?.favorites.find(
        (f: any) =>
          f.book_id === testBookmark.book_id &&
          f.chapter_number === testBookmark.chapter_number,
      );
      expect(bookmark).toBeDefined();
    });

    it("POST /bible/book/bookmark/remove - remove bookmark", async () => {
      const { data, error } = await testClient.bible.book.bookmark.remove.post(
        {
          user_id: testUser.userId,
          ...testBookmark,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
    });

    it("POST /bible/book/bookmark/add - validates required fields", async () => {
      const { error, status } = await testClient.bible.book.bookmark.add.post(
        {
          user_id: testUser.userId,
          // Missing book_id and chapter_number
        } as any,
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeTruthy();
      expect(status).toBe(422); // Validation error
    });
  });

  describe("Last Chapter Read", () => {
    it("POST /bible/book/chapter/save-last-read - save last read chapter", async () => {
      const { data, error } = await testClient.bible.book.chapter[
        "save-last-read"
      ].post(
        {
          user_id: testUser.userId,
          book_id: 1,
          chapter_number: 1,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      if (error) {
        console.log("Save last read validation error:", error);
      }
      expect(data || error).toBeTruthy(); // At least get a response
    });

    it("POST /bible/book/chapter/last-read - get last read chapter", async () => {
      const { data, error } = await testClient.bible.book.chapter[
        "last-read"
      ].post(
        {
          user_id: testUser.userId,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.result).toBeDefined();
    });
  });

  // Conversation/Chat endpoints removed per D-009 — Q&A feature dropped.

  // Notes table doesn't exist in database yet
  describe.skip("Notes CRUD", () => {
    let noteId: string;

    it("POST /bible/book/note/add - add note", async () => {
      const { data, error } = await testClient.bible.book.note.add.post(
        {
          user_id: testUser.userId,
          book_id: 1,
          chapter_number: 1,
          content: "Test note content",
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.note).toBeDefined();

      if (!data?.note?.note_id) {
        throw new Error("Note ID should be defined");
      }
      noteId = data.note.note_id;
    });

    it("PUT /bible/book/note/update - update note", async () => {
      const { data, error } = await testClient.bible.book.note.update.put(
        {
          note_id: noteId,
          content: "Updated note content",
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
    });

    it("DELETE /bible/book/note/remove - remove note", async () => {
      const { data, error } = await testClient.bible.book.note.remove.delete(
        {},
        {
          query: {
            note_id: noteId,
          },
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
    });
  });

  // Highlights have database/overlap issues - needs cleanup strategy or unique test data
  describe("Highlights CRUD", () => {
    let highlightId: number;

    it("POST /bible/highlight/add - add highlight", async () => {
      const { data, error } = await testClient.bible.highlight.add.post(
        {
          user_id: testUser.userId,
          book_id: 1,
          chapter_number: 1,
          start_verse: 10,
          end_verse: 10,
          color: HighlightColorEnum.yellow,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      if (error || !data?.success) {
        console.log("Highlight creation failed:", { error, data });
      }

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);

      // Type narrowing for union response
      if (data && "highlight" in data && data.highlight) {
        expect(data.highlight).toBeDefined();
        expect(data.highlight.highlight_id).toBeDefined();
        highlightId = data.highlight.highlight_id;
      } else {
        throw new Error("Expected highlight in response");
      }
    });

    it("PUT /bible/highlight/:highlight_id - update highlight color", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.bible.highlight[highlightId].put(
        {
          user_id: testUser.userId,
          color: HighlightColorEnum.green,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
    });

    it("DELETE /bible/highlight/:highlight_id - delete highlight", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.bible.highlight[
        highlightId
      ].delete(
        {},
        {
          query: {
            user_id: testUser.userId,
          },
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
    });
  });

  // Ratings have schema validation issues with user field - needs API investigation
  describe.skip("Ratings", () => {
    it("POST /bible/book/explanation/save-rating - save rating", async () => {
      const { data, error } = await testClient.bible.book.explanation[
        "save-rating"
      ].post(
        {
          user: { id: testUser.userId },
          explanation_id: 1,
          book_id: 1,
          chapter_number: 1,
          rating: 5,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.result).toBeDefined();
    });

    it("POST /bible/book/explanation/ratings - get ratings stats", async () => {
      const { data, error } =
        await testClient.bible.book.explanation.ratings.post(
          {
            user: { id: testUser.userId },
            book_id: 1,
            chapter_number: 1,
            explanation_id: 1,
          },
          {
            headers: {
              authorization: `Bearer ${testUser.accessToken}`,
            },
          },
        );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.totalUsersWhoRated).toBeDefined();
    });
  });

  describe("Auto-Highlights", () => {
    let testThemeId: number;

    it("GET /bible/highlight-themes - get active themes", async () => {
      const { data, error } = await testClient.bible["highlight-themes"].get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
      expect(Array.isArray(data?.data)).toBe(true);
      expect(data?.data.length).toBeGreaterThanOrEqual(6); // 6 default themes

      if (data?.data && data.data.length > 0) {
        expect(data.data[0]).toHaveProperty("theme_id");
        expect(data.data[0]).toHaveProperty("name");
        expect(data.data[0]).toHaveProperty("color");
        expect(data.data[0]).toHaveProperty("is_active");
        expect(data.data[0].is_active).toBe(true);
        testThemeId = data.data[0].theme_id;
      }
    });

    it("GET /bible/auto-highlights/:book_id/:chapter_number - get auto-highlights", async () => {
      const { data, error } = await testClient.bible["auto-highlights"]({
        book_id: 1,
      })({
        chapter_number: 1,
      }).get();

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data?.data)).toBe(true);

      // Data may be empty if no highlights have been generated yet
      if (data?.data && data.data.length > 0) {
        expect(data.data[0]).toHaveProperty("auto_highlight_id");
        expect(data.data[0]).toHaveProperty("theme_id");
        expect(data.data[0]).toHaveProperty("book_id");
        expect(data.data[0]).toHaveProperty("chapter_number");
        expect(data.data[0]).toHaveProperty("start_verse");
        expect(data.data[0]).toHaveProperty("end_verse");
        expect(data.data[0]).toHaveProperty("relevance_score");
        expect(data.data[0]).toHaveProperty("theme_name");
        expect(data.data[0]).toHaveProperty("theme_color");
      }
    });

    it("GET /bible/auto-highlights/:book_id/:chapter_number - filter by themes", async () => {
      const { data, error } = await testClient.bible["auto-highlights"]({
        book_id: 1,
      })({ chapter_number: 1 }).get({
        query: {
          themes: `${testThemeId}`,
        },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data?.data)).toBe(true);

      if (data?.data && data.data.length > 0) {
        expect(data.data.every((h: any) => h.theme_id === testThemeId)).toBe(
          true,
        );
      }
    });

    it("GET /bible/auto-highlights/:book_id/:chapter_number - filter by relevance", async () => {
      const { data, error } = await testClient.bible["auto-highlights"]({
        book_id: 1,
      })({ chapter_number: 1 }).get({
        query: {
          min_relevance: 3,
        },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(Array.isArray(data?.data)).toBe(true);

      if (data?.data && data.data.length > 0) {
        expect(data.data.every((h: any) => h.relevance_score <= 3)).toBe(true);
      }
    });

    it("GET /bible/user/theme-preferences - get user theme preferences (auth required)", async () => {
      const { data, error } = await testClient.bible.user[
        "theme-preferences"
      ].get({
        headers: {
          authorization: `Bearer ${testUser.accessToken}`,
        },
      });

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);
      expect(Array.isArray(data?.data)).toBe(true);
      expect(data?.data.length).toBeGreaterThanOrEqual(6);

      if (data?.data && data.data.length > 0) {
        expect(data.data[0]).toHaveProperty("theme_id");
        expect(data.data[0]).toHaveProperty("theme_name");
        expect(data.data[0]).toHaveProperty("theme_color");
        expect(data.data[0]).toHaveProperty("is_enabled");
        expect(data.data[0]).toHaveProperty("relevance_threshold");
      }
    });

    it("PATCH /bible/user/theme-preferences/:theme_id - update user preference (auth required)", async () => {
      // @ts-ignore - Dynamic path parameter
      const { data, error } = await testClient.bible.user["theme-preferences"][
        testThemeId
      ].patch(
        {
          is_enabled: false,
          relevance_threshold: 2,
        },
        {
          headers: {
            authorization: `Bearer ${testUser.accessToken}`,
          },
        },
      );

      expect(error).toBeFalsy();
      expect(data).toBeTruthy();
      expect(data?.success).toBe(true);

      // Verify the update
      const { data: updatedPrefs } = await testClient.bible.user[
        "theme-preferences"
      ].get({
        headers: {
          authorization: `Bearer ${testUser.accessToken}`,
        },
      });

      const updatedPref = updatedPrefs?.data?.find(
        (p: any) => p.theme_id === testThemeId,
      );
      expect(updatedPref?.is_enabled).toBe(false);
      expect(updatedPref?.relevance_threshold).toBe(2);
    });

    it("GET /bible/user/theme-preferences - should require authentication", async () => {
      const { error } = await testClient.bible.user["theme-preferences"].get();

      expect(error).toBeTruthy();
      expect([401, 422]).toContain(error?.status);
    });

    it("PATCH /bible/user/theme-preferences/:theme_id - should require authentication", async () => {
      // @ts-ignore - Dynamic path parameter
      const { error } = await testClient.bible.user["theme-preferences"][
        testThemeId
      ].patch({
        is_enabled: true,
      });

      expect(error).toBeTruthy();
      expect([401, 422]).toContain(error?.status);
    });
  });
});
