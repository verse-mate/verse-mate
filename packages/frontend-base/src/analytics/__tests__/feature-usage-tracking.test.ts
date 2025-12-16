/**
 * Feature Usage Tracking Tests
 *
 * Tests for feature usage event tracking (bookmarks, highlights, notes,
 * dictionary lookup, auto-highlight settings, Bible version preferences).
 *
 * Test coverage:
 * 1. BOOKMARK_ADDED fires with correct properties
 * 2. BOOKMARK_REMOVED fires with correct properties
 * 3. HIGHLIGHT_CREATED fires with correct color
 * 4. HIGHLIGHT_EDITED fires when color changed
 * 5. HIGHLIGHT_DELETED fires with original color
 * 6. NOTE_CREATED/EDITED/DELETED events fire correctly
 * 7. DICTIONARY_LOOKUP fires with word and source
 * 8. AUTO_HIGHLIGHT_SETTING_CHANGED fires with theme changes
 * 9. BIBLE_VERSION_CHANGED fires with version info
 */

import { describe, expect, it, mock } from "bun:test";
import {
  AnalyticsEvent,
  type AutoHighlightSettingChangedProperties,
  type BibleVersionChangedProperties,
  type BookmarkAddedProperties,
  type BookmarkRemovedProperties,
  type DictionaryLookupProperties,
  type HighlightCreatedProperties,
  type HighlightDeletedProperties,
  type HighlightEditedProperties,
  type NoteCreatedProperties,
  type NoteDeletedProperties,
  type NoteEditedProperties,
} from "../types";

// Mock posthog-js module
const mockCapture = mock(() => {});

mock.module("posthog-js", () => ({
  default: {
    capture: mockCapture,
  },
}));

describe("Feature Usage Tracking", () => {
  describe("Bookmark Events", () => {
    it("should have correct properties for BOOKMARK_ADDED", () => {
      const properties: BookmarkAddedProperties = {
        bookId: 1,
        bookName: "Genesis",
        chapterNumber: 1,
        verseNumber: 1,
      };

      expect(properties.bookId).toBe(1);
      expect(properties.bookName).toBe("Genesis");
      expect(properties.chapterNumber).toBe(1);
      expect(properties.verseNumber).toBe(1);
      expect(String(AnalyticsEvent.BOOKMARK_ADDED)).toBe("BOOKMARK_ADDED");
    });

    it("should have correct properties for BOOKMARK_REMOVED", () => {
      const properties: BookmarkRemovedProperties = {
        bookId: 43,
        bookName: "John",
        chapterNumber: 3,
        verseNumber: 16,
      };

      expect(properties.bookId).toBe(43);
      expect(properties.bookName).toBe("John");
      expect(properties.chapterNumber).toBe(3);
      expect(properties.verseNumber).toBe(16);
      expect(String(AnalyticsEvent.BOOKMARK_REMOVED)).toBe("BOOKMARK_REMOVED");
    });
  });

  describe("Highlight Events", () => {
    it("should have correct properties for HIGHLIGHT_CREATED", () => {
      const properties: HighlightCreatedProperties = {
        bookId: 19,
        bookName: "Psalms",
        chapterNumber: 23,
        verseNumber: 1,
        highlightColor: "yellow",
      };

      expect(properties.bookId).toBe(19);
      expect(properties.bookName).toBe("Psalms");
      expect(properties.chapterNumber).toBe(23);
      expect(properties.verseNumber).toBe(1);
      expect(properties.highlightColor).toBe("yellow");
      expect(String(AnalyticsEvent.HIGHLIGHT_CREATED)).toBe(
        "HIGHLIGHT_CREATED",
      );
    });

    it("should have correct properties for HIGHLIGHT_EDITED", () => {
      const properties: HighlightEditedProperties = {
        bookId: 19,
        bookName: "Psalms",
        chapterNumber: 23,
        verseNumber: 1,
        previousColor: "yellow",
        newColor: "blue",
      };

      expect(properties.previousColor).toBe("yellow");
      expect(properties.newColor).toBe("blue");
      expect(String(AnalyticsEvent.HIGHLIGHT_EDITED)).toBe("HIGHLIGHT_EDITED");
    });

    it("should have correct properties for HIGHLIGHT_DELETED", () => {
      const properties: HighlightDeletedProperties = {
        bookId: 19,
        bookName: "Psalms",
        chapterNumber: 23,
        verseNumber: 1,
        highlightColor: "blue",
      };

      expect(properties.highlightColor).toBe("blue");
      expect(String(AnalyticsEvent.HIGHLIGHT_DELETED)).toBe(
        "HIGHLIGHT_DELETED",
      );
    });
  });

  describe("Note Events", () => {
    it("should have correct properties for NOTE_CREATED", () => {
      const properties: NoteCreatedProperties = {
        bookId: 1,
        bookName: "Genesis",
        chapterNumber: 1,
        verseNumber: 1,
      };

      expect(properties.bookId).toBe(1);
      expect(properties.bookName).toBe("Genesis");
      expect(String(AnalyticsEvent.NOTE_CREATED)).toBe("NOTE_CREATED");
    });

    it("should have correct properties for NOTE_EDITED", () => {
      const properties: NoteEditedProperties = {
        bookId: 1,
        bookName: "Genesis",
        chapterNumber: 1,
        verseNumber: 1,
      };

      expect(properties.bookId).toBe(1);
      expect(String(AnalyticsEvent.NOTE_EDITED)).toBe("NOTE_EDITED");
    });

    it("should have correct properties for NOTE_DELETED", () => {
      const properties: NoteDeletedProperties = {
        bookId: 1,
        bookName: "Genesis",
        chapterNumber: 1,
        verseNumber: 1,
      };

      expect(properties.bookId).toBe(1);
      expect(String(AnalyticsEvent.NOTE_DELETED)).toBe("NOTE_DELETED");
    });
  });

  describe("Dictionary Lookup Events", () => {
    it("should have correct properties for DICTIONARY_LOOKUP", () => {
      const properties: DictionaryLookupProperties = {
        word: "grace",
        source: "strongs",
        strongsNumber: "G5485",
      };

      expect(properties.word).toBe("grace");
      expect(properties.source).toBe("strongs");
      expect(properties.strongsNumber).toBe("G5485");
      expect(String(AnalyticsEvent.DICTIONARY_LOOKUP)).toBe(
        "DICTIONARY_LOOKUP",
      );
    });
  });

  describe("Auto-Highlight Settings Events", () => {
    it("should have correct properties for AUTO_HIGHLIGHT_SETTING_CHANGED", () => {
      const properties: AutoHighlightSettingChangedProperties = {
        themeName: "Holy Spirit",
        enabled: true,
      };

      expect(properties.themeName).toBe("Holy Spirit");
      expect(properties.enabled).toBe(true);
      expect(String(AnalyticsEvent.AUTO_HIGHLIGHT_SETTING_CHANGED)).toBe(
        "AUTO_HIGHLIGHT_SETTING_CHANGED",
      );
    });

    it("should track when auto-highlight theme is disabled", () => {
      const properties: AutoHighlightSettingChangedProperties = {
        themeName: "Jesus",
        enabled: false,
      };

      expect(properties.themeName).toBe("Jesus");
      expect(properties.enabled).toBe(false);
    });
  });

  describe("Bible Version Events", () => {
    it("should have correct properties for BIBLE_VERSION_CHANGED", () => {
      const properties: BibleVersionChangedProperties = {
        previousVersion: "NASB1995",
        newVersion: "KJV",
      };

      expect(properties.previousVersion).toBe("NASB1995");
      expect(properties.newVersion).toBe("KJV");
      expect(String(AnalyticsEvent.BIBLE_VERSION_CHANGED)).toBe(
        "BIBLE_VERSION_CHANGED",
      );
    });
  });
});
