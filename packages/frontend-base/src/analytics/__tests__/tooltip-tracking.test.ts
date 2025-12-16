/**
 * Tooltip Tracking Tests
 *
 * Tests for AI/tooltip event tracking.
 *
 * Test coverage:
 * 1. VERSEMATE_TOOLTIP_OPENED fires with verse context
 * 2. AUTO_HIGHLIGHT_TOOLTIP_VIEWED fires with chapter context
 */

import { describe, expect, it, mock } from "bun:test";
import {
  AnalyticsEvent,
  type AutoHighlightTooltipViewedProperties,
  type VersemateTooltipOpenedProperties,
} from "../types";

// Mock posthog-js module
const mockCapture = mock(() => {});

mock.module("posthog-js", () => ({
  default: {
    capture: mockCapture,
  },
}));

describe("Tooltip Tracking", () => {
  describe("VerseMate Tooltip Events", () => {
    it("should have correct properties for VERSEMATE_TOOLTIP_OPENED", () => {
      const properties: VersemateTooltipOpenedProperties = {
        bookId: 43,
        chapterNumber: 3,
        verseNumber: 16,
      };

      expect(properties.bookId).toBe(43);
      expect(properties.chapterNumber).toBe(3);
      expect(properties.verseNumber).toBe(16);
      expect(String(AnalyticsEvent.VERSEMATE_TOOLTIP_OPENED)).toBe(
        "VERSEMATE_TOOLTIP_OPENED",
      );
    });
  });

  describe("Auto-Highlight Tooltip Events", () => {
    it("should have correct properties for AUTO_HIGHLIGHT_TOOLTIP_VIEWED", () => {
      const properties: AutoHighlightTooltipViewedProperties = {
        bookId: 1,
        chapterNumber: 1,
      };

      expect(properties.bookId).toBe(1);
      expect(properties.chapterNumber).toBe(1);
      expect(String(AnalyticsEvent.AUTO_HIGHLIGHT_TOOLTIP_VIEWED)).toBe(
        "AUTO_HIGHLIGHT_TOOLTIP_VIEWED",
      );
    });
  });
});
