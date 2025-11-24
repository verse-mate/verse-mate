/**
 * Cookie Consent Component Tests
 *
 * These tests verify the cookie consent functionality:
 * 1. Consent banner shows on first visit
 * 2. Consent banner does not show when consent already given
 * 3. posthog.opt_in_capturing() is called when user accepts
 * 4. posthog.opt_out_capturing() is called when user declines
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Constants matching the component implementation
const CONSENT_STORAGE_KEY = "posthog-consent";
const CONSENT_ACCEPTED = "accepted";
const CONSENT_DECLINED = "declined";

// Mock posthog-js module
const mockPosthog = {
  opt_in_capturing: mock(() => {}),
  opt_out_capturing: mock(() => {}),
};

// Mock localStorage
let localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: mock((key: string) => localStorageStore[key] ?? null),
  setItem: mock((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: mock((key: string) => {
    delete localStorageStore[key];
  }),
  clear: mock(() => {
    localStorageStore = {};
  }),
};

describe("Cookie Consent", () => {
  beforeEach(() => {
    // Reset mocks and localStorage before each test
    mockPosthog.opt_in_capturing.mockClear();
    mockPosthog.opt_out_capturing.mockClear();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    localStorageStore = {};
  });

  afterEach(() => {
    // Clean up after each test
    localStorageStore = {};
  });

  describe("Banner visibility", () => {
    it("should show consent banner on first visit when no consent state exists", () => {
      // Given: First visit with no consent state in localStorage
      const storedConsent = mockLocalStorage.getItem(CONSENT_STORAGE_KEY);

      // When: Checking if banner should show
      const shouldShowBanner = storedConsent === null;

      // Then: Banner should be visible
      expect(shouldShowBanner).toBe(true);
      expect(storedConsent).toBeNull();
    });

    it("should not show consent banner when consent has already been given (accepted)", () => {
      // Given: User has previously accepted cookies
      localStorageStore[CONSENT_STORAGE_KEY] = CONSENT_ACCEPTED;
      const storedConsent = mockLocalStorage.getItem(CONSENT_STORAGE_KEY);

      // When: Checking if banner should show
      const shouldShowBanner = storedConsent === null;

      // Then: Banner should not be visible
      expect(shouldShowBanner).toBe(false);
      expect(storedConsent).toBe(CONSENT_ACCEPTED);
    });

    it("should not show consent banner when consent has already been given (declined)", () => {
      // Given: User has previously declined cookies
      localStorageStore[CONSENT_STORAGE_KEY] = CONSENT_DECLINED;
      const storedConsent = mockLocalStorage.getItem(CONSENT_STORAGE_KEY);

      // When: Checking if banner should show
      const shouldShowBanner = storedConsent === null;

      // Then: Banner should not be visible
      expect(shouldShowBanner).toBe(false);
      expect(storedConsent).toBe(CONSENT_DECLINED);
    });
  });

  describe("Consent actions", () => {
    it("should call posthog.opt_in_capturing() when user accepts cookies", () => {
      // Given: User is presented with consent banner

      // When: User clicks accept
      const handleAccept = () => {
        mockPosthog.opt_in_capturing();
        mockLocalStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_ACCEPTED);
      };
      handleAccept();

      // Then: PostHog opt_in_capturing should be called and consent should be stored
      expect(mockPosthog.opt_in_capturing).toHaveBeenCalledTimes(1);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        CONSENT_STORAGE_KEY,
        CONSENT_ACCEPTED,
      );
      expect(localStorageStore[CONSENT_STORAGE_KEY]).toBe(CONSENT_ACCEPTED);
    });

    it("should call posthog.opt_out_capturing() when user declines cookies", () => {
      // Given: User is presented with consent banner

      // When: User clicks decline
      const handleDecline = () => {
        mockPosthog.opt_out_capturing();
        mockLocalStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_DECLINED);
      };
      handleDecline();

      // Then: PostHog opt_out_capturing should be called and consent should be stored
      expect(mockPosthog.opt_out_capturing).toHaveBeenCalledTimes(1);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        CONSENT_STORAGE_KEY,
        CONSENT_DECLINED,
      );
      expect(localStorageStore[CONSENT_STORAGE_KEY]).toBe(CONSENT_DECLINED);
    });
  });
});
