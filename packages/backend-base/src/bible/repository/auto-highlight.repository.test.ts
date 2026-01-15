import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { createTestUser } from "../../shared/test-helpers";
import { AutoHighlightRepository } from "./auto-highlight.repository";

describe("AutoHighlightRepository", () => {
  let repository: AutoHighlightRepository;
  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let themeId: number;
  const testBookId = 1; // Genesis
  const testChapter = 1;

  beforeAll(async () => {
    repository = new AutoHighlightRepository(Database);
    testUser = await createTestUser();

    // Get a theme for testing
    const themes = await repository.getActiveThemes();
    if (themes.length === 0) {
      throw new Error("No themes found. Run migrations with seed data.");
    }
    themeId = themes[0].theme_id;
  });

  afterAll(() => {
    Database.closeConnection();
  });

  describe("Theme Operations", () => {
    it("should get all themes", async () => {
      const themes = await repository.getAllThemes();

      expect(themes).toBeDefined();
      expect(Array.isArray(themes)).toBe(true);
      expect(themes.length).toBeGreaterThanOrEqual(6); // 6 default themes
      expect(themes[0]).toHaveProperty("theme_id");
      expect(themes[0]).toHaveProperty("name");
      expect(themes[0]).toHaveProperty("color");
      expect(themes[0]).toHaveProperty("is_active");
    });

    it("should get active themes only", async () => {
      const themes = await repository.getActiveThemes();

      expect(themes).toBeDefined();
      expect(Array.isArray(themes)).toBe(true);
      expect(themes.every((t) => t.is_active === true)).toBe(true);
    });

    it("should get theme by name", async () => {
      const theme = await repository.getThemeByName("Key Verses");

      expect(theme).toBeDefined();
      expect(theme?.name).toBe("Key Verses");
      expect(theme?.color).toBe("yellow");
      expect(theme?.is_system).toBe(true);
    });

    it("should return undefined for non-existent theme", async () => {
      const theme = await repository.getThemeByName("NonExistentTheme");

      expect(theme).toBeUndefined();
    });

    it("should update theme active status", async () => {
      const themes = await repository.getAllThemes();
      const testTheme = themes[0];

      // Toggle to inactive
      await repository.updateThemeActiveStatus(testTheme.theme_id, false);
      let updatedThemes = await repository.getAllThemes();
      let updated = updatedThemes.find(
        (t) => t.theme_id === testTheme.theme_id,
      );
      expect(updated?.is_active).toBe(false);

      // Toggle back to active
      await repository.updateThemeActiveStatus(testTheme.theme_id, true);
      updatedThemes = await repository.getAllThemes();
      updated = updatedThemes.find((t) => t.theme_id === testTheme.theme_id);
      expect(updated?.is_active).toBe(true);
    });
  });

  describe("Highlight Operations", () => {
    beforeAll(async () => {
      // Clean up any existing test highlights
      await repository.deleteHighlightsByBook(testBookId);
    });

    it("should bulk insert highlights", async () => {
      const highlights = [
        {
          theme_id: themeId,
          book_id: testBookId,
          chapter_number: testChapter,
          start_verse: 1,
          end_verse: 1,
          relevance_score: 1,
        },
        {
          theme_id: themeId,
          book_id: testBookId,
          chapter_number: testChapter,
          start_verse: 3,
          end_verse: 5,
          relevance_score: 3,
        },
      ];

      await repository.bulkInsertHighlights(highlights);

      const results = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: testChapter,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it("should get highlights by chapter", async () => {
      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: testChapter,
      });

      expect(Array.isArray(highlights)).toBe(true);
      expect(highlights.length).toBeGreaterThan(0);
      expect(highlights[0]).toHaveProperty("auto_highlight_id");
      expect(highlights[0]).toHaveProperty("theme_id");
      expect(highlights[0]).toHaveProperty("book_id");
      expect(highlights[0]).toHaveProperty("chapter_number");
      expect(highlights[0]).toHaveProperty("start_verse");
      expect(highlights[0]).toHaveProperty("end_verse");
      expect(highlights[0]).toHaveProperty("relevance_score");
      expect(highlights[0]).toHaveProperty("theme_name");
      expect(highlights[0]).toHaveProperty("theme_color");
    });

    it("should filter highlights by theme_ids", async () => {
      const allThemes = await repository.getActiveThemes();
      const firstTheme = allThemes[0];
      const secondTheme = allThemes[1];

      // Insert highlights with different themes
      await repository.bulkInsertHighlights([
        {
          theme_id: firstTheme.theme_id,
          book_id: testBookId,
          chapter_number: testChapter,
          start_verse: 10,
          end_verse: 10,
          relevance_score: 2,
        },
        {
          theme_id: secondTheme.theme_id,
          book_id: testBookId,
          chapter_number: testChapter,
          start_verse: 11,
          end_verse: 11,
          relevance_score: 2,
        },
      ]);

      // Filter by first theme only
      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: testChapter,
        theme_ids: [firstTheme.theme_id],
      });

      expect(highlights.every((h) => h.theme_id === firstTheme.theme_id)).toBe(
        true,
      );
    });

    it("should filter highlights by default relevance", async () => {
      // Insert highlights with different relevance scores
      await repository.bulkInsertHighlights([
        {
          theme_id: themeId,
          book_id: testBookId,
          chapter_number: 2,
          start_verse: 1,
          end_verse: 1,
          relevance_score: 1,
        },
        {
          theme_id: themeId,
          book_id: testBookId,
          chapter_number: 2,
          start_verse: 2,
          end_verse: 2,
          relevance_score: 3,
        },
        {
          theme_id: themeId,
          book_id: testBookId,
          chapter_number: 2,
          start_verse: 3,
          end_verse: 3,
          relevance_score: 5,
        },
      ]);

      // Filter by relevance <= 3
      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 2,
        default_relevance: 3,
      });

      expect(highlights.every((h) => h.relevance_score <= 3)).toBe(true);
      expect(highlights.some((h) => h.relevance_score === 5)).toBe(false);
    });

    it("should filter highlights by per-theme relevance", async () => {
      const allThemes = await repository.getActiveThemes();
      const theme1 = allThemes[0];
      const theme2 = allThemes[1];

      // Insert highlights with different themes and relevance
      await repository.bulkInsertHighlights([
        {
          theme_id: theme1.theme_id,
          book_id: testBookId,
          chapter_number: 3,
          start_verse: 1,
          end_verse: 1,
          relevance_score: 2,
        },
        {
          theme_id: theme1.theme_id,
          book_id: testBookId,
          chapter_number: 3,
          start_verse: 2,
          end_verse: 2,
          relevance_score: 4,
        },
        {
          theme_id: theme2.theme_id,
          book_id: testBookId,
          chapter_number: 3,
          start_verse: 3,
          end_verse: 3,
          relevance_score: 5,
        },
      ]);

      // Per-theme relevance: theme1 <= 3, theme2 <= 5
      const themeRelevanceMap = new Map([
        [theme1.theme_id, 3],
        [theme2.theme_id, 5],
      ]);

      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 3,
        theme_relevance_map: themeRelevanceMap,
      });

      // Should include theme1 with relevance 2, and theme2 with relevance 5
      // Should exclude theme1 with relevance 4
      const theme1Highlights = highlights.filter(
        (h) => h.theme_id === theme1.theme_id,
      );
      const theme2Highlights = highlights.filter(
        (h) => h.theme_id === theme2.theme_id,
      );

      expect(theme1Highlights.every((h) => h.relevance_score <= 3)).toBe(true);
      expect(theme2Highlights.every((h) => h.relevance_score <= 5)).toBe(true);
    });

    it("should delete highlights by book", async () => {
      // Insert some highlights
      await repository.bulkInsertHighlights([
        {
          theme_id: themeId,
          book_id: testBookId,
          chapter_number: 4,
          start_verse: 1,
          end_verse: 1,
          relevance_score: 1,
        },
      ]);

      // Verify they exist
      let highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 4,
      });
      expect(highlights.length).toBeGreaterThan(0);

      // Delete all highlights for this book
      await repository.deleteHighlightsByBook(testBookId);

      // Verify they're gone
      highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 4,
      });
      expect(highlights.length).toBe(0);
    });
  });

  describe("User Theme Preferences", () => {
    it("should upsert user theme preference (insert)", async () => {
      await repository.upsertUserThemePreference({
        user_id: testUser.userId,
        theme_id: themeId,
        is_enabled: false,
        relevance_threshold: 2,
      });

      const prefs = await repository.getUserThemePreferences(testUser.userId);
      const pref = prefs.find((p) => p.theme_id === themeId);

      expect(pref).toBeDefined();
      expect(pref?.is_enabled).toBe(false);
      expect(pref?.relevance_threshold).toBe(2);
    });

    it("should upsert user theme preference (update)", async () => {
      // Insert initial preference
      await repository.upsertUserThemePreference({
        user_id: testUser.userId,
        theme_id: themeId,
        is_enabled: true,
        relevance_threshold: 3,
      });

      // Update it
      await repository.upsertUserThemePreference({
        user_id: testUser.userId,
        theme_id: themeId,
        is_enabled: false,
        relevance_threshold: 5,
      });

      const prefs = await repository.getUserThemePreferences(testUser.userId);
      const pref = prefs.find((p) => p.theme_id === themeId);

      expect(pref).toBeDefined();
      expect(pref?.is_enabled).toBe(false);
      expect(pref?.relevance_threshold).toBe(5);
    });

    it("should get user theme preferences with theme details", async () => {
      await repository.upsertUserThemePreference({
        user_id: testUser.userId,
        theme_id: themeId,
        is_enabled: true,
        relevance_threshold: 4,
      });

      const prefs = await repository.getUserThemePreferences(testUser.userId);

      expect(Array.isArray(prefs)).toBe(true);
      const pref = prefs.find((p) => p.theme_id === themeId);
      expect(pref).toBeDefined();
      expect(pref?.theme_name).toBeDefined();
      expect(pref?.theme_color).toBeDefined();
      expect(pref?.theme_description).toBeDefined();
    });
  });

  describe("Global Settings", () => {
    it("should get global setting", async () => {
      const value = await repository.getGlobalSetting(
        "default_relevance_threshold",
      );

      expect(value).toBeDefined();
      expect(typeof value).toBe("string");
      expect(Number.parseInt(value as string, 10)).toBeGreaterThanOrEqual(1);
      expect(Number.parseInt(value as string, 10)).toBeLessThanOrEqual(5);
    });

    it("should update global setting", async () => {
      await repository.updateGlobalSetting("default_relevance_threshold", "4");

      const value = await repository.getGlobalSetting(
        "default_relevance_threshold",
      );
      expect(value).toBe("4");

      // Reset to default
      await repository.updateGlobalSetting("default_relevance_threshold", "3");
    });

    it("should return null for non-existent setting", async () => {
      const value = await repository.getGlobalSetting("non_existent_setting");
      expect(value).toBeNull();
    });
  });
});
