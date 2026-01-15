import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { ValidationError } from "../../common/errors";
import { AutoHighlightRepository } from "../repository/auto-highlight.repository";
import { BibleRepository } from "../repository/bible.repository";
import { AutoHighlightService } from "./auto-highlight.service";

describe("AutoHighlightService", () => {
  let service: AutoHighlightService;
  let bibleRepository: BibleRepository;
  let testUserId: string;
  const testBookId = 1; // Genesis

  beforeAll(async () => {
    bibleRepository = new BibleRepository(Database);
    service = new AutoHighlightService(Database, bibleRepository);

    // Create test user directly via database (avoids circular dependency in createTestUser)
    const testEmail = `test-auto-highlight-svc-${Date.now()}@test.com`;
    const user = await Database.getOrCreateConnection()
      .insertInto("user")
      .values({
        email: testEmail,
        firstName: "Test",
        lastName: "User",
        password: "hashed-password",
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    testUserId = user.id;
  });

  afterAll(() => {
    Database.closeConnection();
  });

  describe("Theme Operations", () => {
    it("should get all themes", async () => {
      const themes = await service.getAllThemes();

      expect(themes).toBeDefined();
      expect(Array.isArray(themes)).toBe(true);
      expect(themes.length).toBeGreaterThanOrEqual(6);
    });

    it("should get active themes", async () => {
      const themes = await service.getActiveThemes();

      expect(themes).toBeDefined();
      expect(Array.isArray(themes)).toBe(true);
      expect(themes.every((t) => t.is_active === true)).toBe(true);
    });

    it("should update theme active status", async () => {
      const themes = await service.getAllThemes();
      const testTheme = themes[0];

      await service.updateThemeActiveStatus(testTheme.theme_id, false);
      const allThemes = await service.getAllThemes();
      const updated = allThemes.find((t) => t.theme_id === testTheme.theme_id);
      expect(updated?.is_active).toBe(false);

      // Reset
      await service.updateThemeActiveStatus(testTheme.theme_id, true);
    });
  });

  describe("User Theme Preferences", () => {
    it("should get user theme preferences with defaults", async () => {
      const prefs = await service.getUserThemePreferences(testUserId);

      expect(Array.isArray(prefs)).toBe(true);
      expect(prefs.length).toBeGreaterThanOrEqual(6);

      // All active themes should be present
      const activeThemes = await service.getActiveThemes();
      expect(prefs.length).toBe(activeThemes.length);

      // Check default values
      const firstPref = prefs[0];
      expect(firstPref).toHaveProperty("theme_id");
      expect(firstPref).toHaveProperty("theme_name");
      expect(firstPref).toHaveProperty("theme_color");
      expect(firstPref).toHaveProperty("is_enabled");
      expect(firstPref).toHaveProperty("relevance_threshold");
      expect(firstPref.is_enabled).toBe(false); // Default (disabled for new users)
      expect(firstPref.relevance_threshold).toBe(3); // Default
    });

    it("should update user theme preference", async () => {
      const themes = await service.getActiveThemes();
      const testTheme = themes[0];

      await service.updateUserThemePreference({
        user_id: testUserId,
        theme_id: testTheme.theme_id,
        is_enabled: false,
        relevance_threshold: 2,
      });

      const prefs = await service.getUserThemePreferences(testUserId);
      const updated = prefs.find((p) => p.theme_id === testTheme.theme_id);

      expect(updated?.is_enabled).toBe(false);
      expect(updated?.relevance_threshold).toBe(2);
    });

    it("should merge user preferences with active themes", async () => {
      const themes = await service.getActiveThemes();

      // Set preference for first theme only
      await service.updateUserThemePreference({
        user_id: testUserId,
        theme_id: themes[0].theme_id,
        is_enabled: false,
        relevance_threshold: 1,
      });

      const prefs = await service.getUserThemePreferences(testUserId);

      // Should return all active themes
      expect(prefs.length).toBe(themes.length);

      // First theme should have custom settings
      const customPref = prefs.find((p) => p.theme_id === themes[0].theme_id);
      expect(customPref?.is_enabled).toBe(false);
      expect(customPref?.relevance_threshold).toBe(1);

      // Other themes should have defaults (disabled for new users)
      const defaultPref = prefs.find((p) => p.theme_id === themes[1].theme_id);
      expect(defaultPref?.is_enabled).toBe(false);
      expect(defaultPref?.relevance_threshold).toBe(3);
    });
  });

  describe("Global Settings", () => {
    it("should get global default relevance", async () => {
      const relevance = await service.getGlobalDefaultRelevance();

      expect(typeof relevance).toBe("number");
      expect(relevance).toBeGreaterThanOrEqual(1);
      expect(relevance).toBeLessThanOrEqual(5);
    });

    it("should update global default relevance", async () => {
      await service.updateGlobalDefaultRelevance(4);

      const relevance = await service.getGlobalDefaultRelevance();
      expect(relevance).toBe(4);

      // Reset
      await service.updateGlobalDefaultRelevance(3);
    });

    it("should throw validation error for invalid relevance", async () => {
      expect(async () => {
        await service.updateGlobalDefaultRelevance(0);
      }).toThrow(ValidationError);

      expect(async () => {
        await service.updateGlobalDefaultRelevance(6);
      }).toThrow(ValidationError);
    });
  });

  describe("AI Response Parsing", () => {
    let repository: AutoHighlightRepository;

    beforeAll(async () => {
      repository = new AutoHighlightRepository(Database);
      // Clean up test book
      await repository.deleteHighlightsByBook(testBookId);
    });

    it("should parse single verse format", async () => {
      const aiResponse = `
{verse:Genesis 1:1} - Key Verses - Relevance: 1
{verse:Genesis 1:3} - Commands - Relevance: 2
      `;

      const count = await service.processAIResponse(testBookId, aiResponse);

      expect(count).toBe(2);

      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });

      const verse1 = highlights.find(
        (h) => h.start_verse === 1 && h.end_verse === 1,
      );
      expect(verse1).toBeDefined();
      expect(verse1?.theme_name).toBe("Key Verses");
      expect(verse1?.relevance_score).toBe(1);

      const verse3 = highlights.find(
        (h) => h.start_verse === 3 && h.end_verse === 3,
      );
      expect(verse3).toBeDefined();
      expect(verse3?.theme_name).toBe("Commands");
      expect(verse3?.relevance_score).toBe(2);
    });

    it("should parse verse range format", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse = `
{verse:Genesis 1:1-5} - Promises from God - Relevance: 3
      `;

      const count = await service.processAIResponse(testBookId, aiResponse);

      expect(count).toBe(1);

      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });

      const verseRange = highlights.find(
        (h) => h.start_verse === 1 && h.end_verse === 5,
      );
      expect(verseRange).toBeDefined();
      expect(verseRange?.theme_name).toBe("Promises from God");
      expect(verseRange?.relevance_score).toBe(3);
    });

    it("should parse chapter format", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse = `
{chapter:Genesis 1} - Warnings - Relevance: 4
      `;

      const count = await service.processAIResponse(testBookId, aiResponse);

      expect(count).toBe(1);

      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });

      // Chapter highlights should span all verses
      const chapterHighlight = highlights[0];
      expect(chapterHighlight).toBeDefined();
      expect(chapterHighlight.start_verse).toBe(1);
      expect(chapterHighlight.end_verse).toBeGreaterThan(1); // Genesis 1 has 31 verses
      expect(chapterHighlight.theme_name).toBe("Warnings");
      expect(chapterHighlight.relevance_score).toBe(4);
    });

    it("should handle mixed formats in one response", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse = `
{verse:Genesis 1:1} - Key Verses - Relevance: 1
{verse:Genesis 1:3-5} - Commands - Relevance: 2
{chapter:Genesis 2} - Comfort - Relevance: 3
      `;

      const count = await service.processAIResponse(testBookId, aiResponse);

      expect(count).toBe(3);

      const chapter1Highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });
      expect(chapter1Highlights.length).toBe(2);

      const chapter2Highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 2,
      });
      expect(chapter2Highlights.length).toBe(1);
    });

    it("should skip invalid relevance scores", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse = `
{verse:Genesis 1:1} - Key Verses - Relevance: 0
{verse:Genesis 1:2} - Commands - Relevance: 3
{verse:Genesis 1:3} - Warnings - Relevance: 6
      `;

      const count = await service.processAIResponse(testBookId, aiResponse);

      // Only verse 2 with relevance 3 should be inserted
      expect(count).toBe(1);

      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });

      expect(highlights.length).toBe(1);
      expect(highlights[0].start_verse).toBe(2);
    });

    it("should skip unknown theme names", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse = `
{verse:Genesis 1:1} - Unknown Theme - Relevance: 2
{verse:Genesis 1:2} - Key Verses - Relevance: 2
      `;

      const count = await service.processAIResponse(testBookId, aiResponse);

      // Only verse 2 with known theme should be inserted
      expect(count).toBe(1);

      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });

      expect(highlights.length).toBe(1);
      expect(highlights[0].start_verse).toBe(2);
      expect(highlights[0].theme_name).toBe("Key Verses");
    });

    it("should handle malformed references gracefully", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse = `
{verse:InvalidReference} - Key Verses - Relevance: 2
{verse:Genesis 1:1} - Key Verses - Relevance: 2
      `;

      const count = await service.processAIResponse(testBookId, aiResponse);

      // Only valid reference should be inserted
      expect(count).toBe(1);

      const highlights = await repository.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });

      expect(highlights.length).toBe(1);
    });

    it("should handle empty AI response", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse = "";

      const count = await service.processAIResponse(testBookId, aiResponse);

      expect(count).toBe(0);
    });

    it("should handle response with no matches", async () => {
      await repository.deleteHighlightsByBook(testBookId);

      const aiResponse =
        "This is some text without any highlight placeholders.";

      const count = await service.processAIResponse(testBookId, aiResponse);

      expect(count).toBe(0);
    });
  });

  describe("Get Highlights by Chapter", () => {
    it("should get highlights by chapter", async () => {
      const highlights = await service.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
      });

      expect(Array.isArray(highlights)).toBe(true);
    });

    it("should filter by theme_ids", async () => {
      const themes = await service.getActiveThemes();
      const themeIds = [themes[0].theme_id];

      const highlights = await service.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
        theme_ids: themeIds,
      });

      expect(
        highlights.every((h) => themeIds.includes(h.theme_id)),
      ).toBeTruthy();
    });

    it("should filter by relevance", async () => {
      const highlights = await service.getHighlightsByChapter({
        book_id: testBookId,
        chapter_number: 1,
        default_relevance: 3,
      });

      expect(highlights.every((h) => h.relevance_score <= 3)).toBeTruthy();
    });
  });
});
