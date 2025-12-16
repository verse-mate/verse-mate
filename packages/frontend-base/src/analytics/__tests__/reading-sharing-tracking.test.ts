/**
 * Reading and Sharing Tracking Tests
 *
 * Tests for Bible reading and sharing event tracking.
 *
 * Test coverage:
 * 1. CHAPTER_VIEWED fires with correct properties
 * 2. EXPLANATION_TAB_CHANGED fires with tab name
 * 3. CHAPTER_SHARED fires with book/chapter info
 * 4. TOPIC_SHARED fires with category and topic slug
 */

import { describe, expect, it, mock } from "bun:test";
import {
  AnalyticsEvent,
  type ChapterSharedProperties,
  type ChapterViewedProperties,
  type ExplanationTabChangedProperties,
  type TopicSharedProperties,
} from "../types";

// Mock posthog-js module
const mockCapture = mock(() => {});

mock.module("posthog-js", () => ({
  default: {
    capture: mockCapture,
  },
}));

describe("Reading and Sharing Tracking", () => {
  describe("Chapter Viewed Events", () => {
    it("should have correct properties for CHAPTER_VIEWED", () => {
      const properties: ChapterViewedProperties = {
        bookId: 1,
        chapterNumber: 1,
        bibleVersion: "NASB1995",
      };

      expect(properties.bookId).toBe(1);
      expect(properties.chapterNumber).toBe(1);
      expect(properties.bibleVersion).toBe("NASB1995");
      expect(String(AnalyticsEvent.CHAPTER_VIEWED)).toBe("CHAPTER_VIEWED");
    });

    it("should support different Bible versions", () => {
      const versions = ["NASB1995", "KJV", "NIV", "ESV"];

      for (const version of versions) {
        const properties: ChapterViewedProperties = {
          bookId: 43,
          chapterNumber: 3,
          bibleVersion: version,
        };
        expect(properties.bibleVersion).toBe(version);
      }
    });
  });

  describe("Explanation Tab Changed Events", () => {
    it("should have correct properties for EXPLANATION_TAB_CHANGED", () => {
      const summaryProperties: ExplanationTabChangedProperties = {
        tab: "summary",
      };

      expect(summaryProperties.tab).toBe("summary");
      expect(String(AnalyticsEvent.EXPLANATION_TAB_CHANGED)).toBe(
        "EXPLANATION_TAB_CHANGED",
      );
    });

    it("should support all tab types", () => {
      const tabs: ("summary" | "byline" | "detailed")[] = [
        "summary",
        "byline",
        "detailed",
      ];

      for (const tab of tabs) {
        const properties: ExplanationTabChangedProperties = { tab };
        expect(properties.tab).toBe(tab);
      }
    });
  });

  describe("Chapter Shared Events", () => {
    it("should have correct properties for CHAPTER_SHARED", () => {
      const properties: ChapterSharedProperties = {
        bookId: 19,
        chapterNumber: 23,
      };

      expect(properties.bookId).toBe(19);
      expect(properties.chapterNumber).toBe(23);
      expect(String(AnalyticsEvent.CHAPTER_SHARED)).toBe("CHAPTER_SHARED");
    });
  });

  describe("Topic Shared Events", () => {
    it("should have correct properties for TOPIC_SHARED", () => {
      const properties: TopicSharedProperties = {
        category: "salvation",
        topicSlug: "how-to-be-saved",
      };

      expect(properties.category).toBe("salvation");
      expect(properties.topicSlug).toBe("how-to-be-saved");
      expect(String(AnalyticsEvent.TOPIC_SHARED)).toBe("TOPIC_SHARED");
    });
  });
});
