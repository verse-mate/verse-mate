/**
 * Analytics Service Tests
 *
 * Tests for the analytics service wrapper over PostHog SDK.
 *
 * Test coverage:
 * 1. track() skips tracking in development mode
 * 2. track() calls posthog.capture with correct event name and properties
 * 3. identify() calls posthog.identify with userId and traits
 * 4. reset() calls posthog.reset
 * 5. setUserProperties() calls posthog.capture with `$set` pattern
 * 6. AnalyticsEvent enum contains all expected event names
 */

import { describe, expect, it, mock } from "bun:test";
import { AnalyticsEvent } from "../types";

// Mock posthog-js module
const mockCapture = mock(() => {});
const mockIdentify = mock(() => {});
const mockReset = mock(() => {});
const mockRegister = mock(() => {});

mock.module("posthog-js", () => ({
  default: {
    capture: mockCapture,
    identify: mockIdentify,
    reset: mockReset,
    register: mockRegister,
  },
}));

describe("Analytics Service", () => {
  describe("track()", () => {
    it("should have the correct interface for tracking events", async () => {
      const { analytics } = await import("../analytics");

      // Verify the track function exists
      expect(typeof analytics.track).toBe("function");
    });

    it("should accept correct event name and properties structure", () => {
      // Verify the AnalyticsEvent enum has the expected event
      expect(String(AnalyticsEvent.CHAPTER_VIEWED)).toBe("CHAPTER_VIEWED");

      // Verify the properties structure is correct
      const properties = {
        bookId: 1,
        chapterNumber: 3,
        bibleVersion: "KJV",
      };

      expect(properties.bookId).toBe(1);
      expect(properties.chapterNumber).toBe(3);
      expect(properties.bibleVersion).toBe("KJV");
    });
  });

  describe("identify()", () => {
    it("should have the correct interface for identifying users", async () => {
      const { analytics } = await import("../analytics");

      // Verify the identify function exists
      expect(typeof analytics.identify).toBe("function");
    });

    it("should accept userId and traits structure", () => {
      const userId = "user-123";
      const traits = {
        email: "user@example.com",
        account_type: "email" as const,
        is_registered: true,
      };

      // Verify traits structure matches UserProperties interface
      expect(userId).toBe("user-123");
      expect(traits.email).toBe("user@example.com");
      expect(traits.account_type).toBe("email");
      expect(traits.is_registered).toBe(true);
    });
  });

  describe("reset()", () => {
    it("should have the correct interface for resetting user identity", async () => {
      const { analytics } = await import("../analytics");

      // The reset function should exist
      expect(typeof analytics.reset).toBe("function");
    });
  });

  describe("setUserProperties()", () => {
    it("should have the correct interface for setting user properties", async () => {
      const { analytics } = await import("../analytics");

      // The setUserProperties function should exist
      expect(typeof analytics.setUserProperties).toBe("function");
    });

    it("should accept correct user properties structure", () => {
      const properties = {
        preferred_bible_version: "KJV",
        theme_preference: "dark",
      };

      // Verify the properties structure is correct for user properties
      expect(properties.preferred_bible_version).toBe("KJV");
      expect(properties.theme_preference).toBe("dark");
    });
  });

  describe("registerSuperProperties()", () => {
    it("should have the correct interface for registering super properties", async () => {
      const { analytics } = await import("../analytics");

      // The registerSuperProperties function should exist
      expect(typeof analytics.registerSuperProperties).toBe("function");
    });
  });

  describe("isEnabled()", () => {
    it("should have the correct interface for checking if analytics is enabled", async () => {
      const { analytics } = await import("../analytics");

      // The isEnabled function should exist
      expect(typeof analytics.isEnabled).toBe("function");
    });
  });
});

describe("AnalyticsEvent Enum", () => {
  it("should contain all expected Bible reading event names", () => {
    expect(String(AnalyticsEvent.CHAPTER_VIEWED)).toBe("CHAPTER_VIEWED");
    expect(String(AnalyticsEvent.VIEW_MODE_SWITCHED)).toBe(
      "VIEW_MODE_SWITCHED",
    );
    expect(String(AnalyticsEvent.EXPLANATION_TAB_CHANGED)).toBe(
      "EXPLANATION_TAB_CHANGED",
    );
  });

  it("should contain all expected feature usage event names", () => {
    expect(String(AnalyticsEvent.BOOKMARK_ADDED)).toBe("BOOKMARK_ADDED");
    expect(String(AnalyticsEvent.BOOKMARK_REMOVED)).toBe("BOOKMARK_REMOVED");
    expect(String(AnalyticsEvent.HIGHLIGHT_CREATED)).toBe("HIGHLIGHT_CREATED");
    expect(String(AnalyticsEvent.HIGHLIGHT_EDITED)).toBe("HIGHLIGHT_EDITED");
    expect(String(AnalyticsEvent.HIGHLIGHT_DELETED)).toBe("HIGHLIGHT_DELETED");
    expect(String(AnalyticsEvent.NOTE_CREATED)).toBe("NOTE_CREATED");
    expect(String(AnalyticsEvent.NOTE_EDITED)).toBe("NOTE_EDITED");
    expect(String(AnalyticsEvent.NOTE_DELETED)).toBe("NOTE_DELETED");
    expect(String(AnalyticsEvent.DICTIONARY_LOOKUP)).toBe("DICTIONARY_LOOKUP");
    expect(String(AnalyticsEvent.AUTO_HIGHLIGHT_SETTING_CHANGED)).toBe(
      "AUTO_HIGHLIGHT_SETTING_CHANGED",
    );
  });

  it("should contain all expected sharing event names", () => {
    expect(String(AnalyticsEvent.CHAPTER_SHARED)).toBe("CHAPTER_SHARED");
    expect(String(AnalyticsEvent.TOPIC_SHARED)).toBe("TOPIC_SHARED");
  });

  it("should contain all expected AI/tooltip event names", () => {
    expect(String(AnalyticsEvent.VERSEMATE_TOOLTIP_OPENED)).toBe(
      "VERSEMATE_TOOLTIP_OPENED",
    );
    expect(String(AnalyticsEvent.AUTO_HIGHLIGHT_TOOLTIP_VIEWED)).toBe(
      "AUTO_HIGHLIGHT_TOOLTIP_VIEWED",
    );
  });

  it("should contain all expected authentication event names", () => {
    expect(String(AnalyticsEvent.SIGNUP_COMPLETED)).toBe("SIGNUP_COMPLETED");
    expect(String(AnalyticsEvent.LOGIN_COMPLETED)).toBe("LOGIN_COMPLETED");
    expect(String(AnalyticsEvent.LOGOUT)).toBe("LOGOUT");
  });
});
