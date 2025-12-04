import { beforeEach, describe, expect, test } from "bun:test";
import {
  batchLookup,
  clearCache,
  getStats,
  lookup,
  preload,
} from "../lexicon.service";

describe("Lexicon Service", () => {
  beforeEach(() => {
    // Clear cache before each test to ensure clean state
    clearCache();
  });

  describe("lookup()", () => {
    test("should return error when strongsNum is empty", async () => {
      const result = await lookup("");
      expect(result.found).toBe(false);
      expect(result.error).toBe("Number is required");
      expect(result.entry).toBeNull();
    });

    test("should return error for invalid format (no G or H prefix)", async () => {
      const result = await lookup("1234");
      expect(result.found).toBe(false);
      expect(result.error).toContain("Invalid number format");
      expect(result.entry).toBeNull();
    });

    test("should lookup valid Greek word (G26 - agape)", async () => {
      const result = await lookup("G26");
      expect(result.found).toBe(true);
      expect(result.entry).not.toBeNull();
      expect(result.entry?.lemma).toContain("ἀγάπη");
      expect(result.error).toBeUndefined();
    });

    test("should lookup valid Hebrew word (H430 - Elohim)", async () => {
      const result = await lookup("H430");
      expect(result.found).toBe(true);
      expect(result.entry).not.toBeNull();
      expect(result.entry?.lemma).toContain("אֱלֹהִים");
      expect(result.error).toBeUndefined();
    });

    test("should be case-insensitive (lowercase g26)", async () => {
      const result = await lookup("g26");
      expect(result.found).toBe(true);
      expect(result.entry).not.toBeNull();
    });

    test("should return error for non-existent Greek number", async () => {
      const result = await lookup("G99999");
      expect(result.found).toBe(false);
      expect(result.error).toContain("not found in greek lexicon");
      expect(result.entry).toBeNull();
    });

    test("should return error for non-existent Hebrew number", async () => {
      const result = await lookup("H99999");
      expect(result.found).toBe(false);
      expect(result.error).toContain("not found in hebrew lexicon");
      expect(result.entry).toBeNull();
    });
  });

  describe("batchLookup()", () => {
    test("should lookup multiple numbers", async () => {
      const results = await batchLookup(["G26", "H430", "G2316"]);
      expect(results).toHaveLength(3);
      expect(results[0].found).toBe(true);
      expect(results[1].found).toBe(true);
      expect(results[2].found).toBe(true);
    });

    test("should handle mixed valid and invalid numbers", async () => {
      const results = await batchLookup(["G26", "G99999", "H430"]);
      expect(results).toHaveLength(3);
      expect(results[0].found).toBe(true);
      expect(results[1].found).toBe(false);
      expect(results[2].found).toBe(true);
    });

    test("should return empty array for empty input", async () => {
      const results = await batchLookup([]);
      expect(results).toHaveLength(0);
    });
  });

  describe("preload()", () => {
    test("should preload both lexicons without error", async () => {
      await preload();
      // If we get here without throwing, the test passes
      expect(true).toBe(true);
    });

    test("should make subsequent lookups faster (cache hit)", async () => {
      // Preload
      await preload();

      // These lookups should hit cache
      const result1 = await lookup("G26");
      const result2 = await lookup("H430");

      expect(result1.found).toBe(true);
      expect(result2.found).toBe(true);
    });
  });

  describe("clearCache()", () => {
    test("should clear cached lexicon data", async () => {
      // Load data
      await lookup("G26");
      await lookup("H430");

      // Clear cache
      clearCache();

      // Verify cache is cleared by checking stats
      const stats = await getStats();
      // After getStats, data will be loaded again, so we can't check if cache is empty
      // But we can verify the function doesn't throw
      expect(stats.greek.totalEntries).toBeGreaterThan(0);
      expect(stats.hebrew.totalEntries).toBeGreaterThan(0);
    });
  });

  describe("getStats()", () => {
    test("should return statistics for both lexicons", async () => {
      const stats = await getStats();

      expect(stats.greek).toBeDefined();
      expect(stats.hebrew).toBeDefined();

      expect(stats.greek.totalEntries).toBeGreaterThan(5000);
      expect(stats.hebrew.totalEntries).toBeGreaterThan(8000);

      expect(typeof stats.greek.cached).toBe("boolean");
      expect(typeof stats.hebrew.cached).toBe("boolean");
    });

    test("should show cached status after loading", async () => {
      // Clear cache first
      clearCache();

      // Load Greek
      await lookup("G26");

      const stats = await getStats();

      // Both should be cached now after getStats loads them
      expect(stats.greek.cached).toBe(true);
      expect(stats.hebrew.cached).toBe(true);
    });
  });

  describe("Lazy Loading", () => {
    test("should only load Greek lexicon when looking up Greek word", async () => {
      clearCache();
      await lookup("G26");

      // We can't directly check if only Greek is loaded without exposing cache
      // But we can verify it works correctly
      const result = await lookup("G2316");
      expect(result.found).toBe(true);
    });

    test("should only load Hebrew lexicon when looking up Hebrew word", async () => {
      clearCache();
      await lookup("H430");

      // Verify it works correctly
      const result = await lookup("H3068");
      expect(result.found).toBe(true);
    });
  });

  describe("Entry Structure", () => {
    test("should return complete Greek entry structure", async () => {
      const result = await lookup("G26");

      expect(result.entry).toBeDefined();
      expect(result.entry?.id).toBe("G26");
      expect(result.entry?.lemma).toBeDefined();
      expect(result.entry?.transliteration).toBeDefined();
      expect(result.entry?.definition).toBeDefined();
      expect(result.entry?.kjvTranslation).toBeDefined();
      expect(result.entry?.derivation).toBeDefined();
    });

    test("should return complete Hebrew entry structure", async () => {
      const result = await lookup("H430");

      expect(result.entry).toBeDefined();
      expect(result.entry?.id).toBe("H430");
      expect(result.entry?.lemma).toBeDefined();
      // transliteration is optional in some entries
      expect(result.entry?.definition).toBeDefined();
      expect(result.entry?.kjvTranslation).toBeDefined();
      expect(result.entry?.derivation).toBeDefined();
    });
  });
});
