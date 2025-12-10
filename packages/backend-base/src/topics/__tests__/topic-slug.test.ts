import { describe, expect, it } from "bun:test";
import {
  generateTopicSlug,
  generateUniqueSlug,
  getCategoryFromSlug,
  getCategorySlug,
} from "../utils/slug.utils";

describe("Topic Slug Utils", () => {
  describe("generateTopicSlug", () => {
    it("converts title to lowercase slug", () => {
      expect(generateTopicSlug("The Resurrection")).toBe("the-resurrection");
    });

    it("removes special characters", () => {
      expect(generateTopicSlug("God's Love")).toBe("gods-love");
      expect(generateTopicSlug("Grace & Mercy")).toBe("grace-mercy");
    });

    it("collapses multiple spaces and hyphens", () => {
      expect(generateTopicSlug("The   Good   Samaritan")).toBe("the-good-samaritan");
      expect(generateTopicSlug("Faith--Works")).toBe("faith-works");
    });

    it("trims whitespace and hyphens", () => {
      expect(generateTopicSlug("  Holy Spirit  ")).toBe("holy-spirit");
      expect(generateTopicSlug("-Creation-")).toBe("creation");
    });
  });

  describe("getCategoryFromSlug", () => {
    it("maps valid category slugs to backend categories", () => {
      expect(getCategoryFromSlug("events")).toBe("EVENT");
      expect(getCategoryFromSlug("prophecies")).toBe("PROPHECY");
      expect(getCategoryFromSlug("parables")).toBe("PARABLE");
      expect(getCategoryFromSlug("themes")).toBe("THEME");
    });

    it("returns null for invalid category slugs", () => {
      expect(getCategoryFromSlug("invalid")).toBeNull();
      expect(getCategoryFromSlug("")).toBeNull();
    });

    it("is case insensitive", () => {
      expect(getCategoryFromSlug("Events")).toBe("EVENT");
    });
  });

  describe("getCategorySlug", () => {
    it("maps backend categories to URL slugs", () => {
      expect(getCategorySlug("EVENT")).toBe("events");
      expect(getCategorySlug("PROPHECY")).toBe("prophecies");
    });
  });

  describe("generateUniqueSlug", () => {
    it("returns base slug if not in existing slugs", () => {
      const existing = ["other-topic"];
      expect(generateUniqueSlug("my-topic", "EVENT", existing)).toBe("my-topic");
    });

    it("appends -2 if slug exists", () => {
      const existing = ["my-topic"];
      expect(generateUniqueSlug("my-topic", "EVENT", existing)).toBe("my-topic-2");
    });

    it("increments suffix if -2 also exists", () => {
      const existing = ["my-topic", "my-topic-2"];
      expect(generateUniqueSlug("my-topic", "EVENT", existing)).toBe("my-topic-3");
    });

    it("handles non-consecutive suffixes correctly", () => {
      const existing = ["my-topic", "my-topic-3"];
      // Should fill the gap or just find next available?
      // Logic: start at 2, increment until not found.
      // So it should find my-topic-2 is available.
      expect(generateUniqueSlug("my-topic", "EVENT", existing)).toBe("my-topic-2");
    });
  });
});
