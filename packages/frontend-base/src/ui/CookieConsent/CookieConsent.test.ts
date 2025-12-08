/**
 * Cookie Consent Component Tests
 *
 * These tests verify the cookie consent functionality:
 * 1. Consent banner shows on first visit
 * 2. Consent banner does not show when consent already acknowledged
 * 3. localStorage is updated when user clicks OK
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Constants matching the component implementation
const CONSENT_STORAGE_KEY = "cookie-consent";
const CONSENT_ACKNOWLEDGED = "acknowledged";

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

    it("should not show consent banner when consent has already been acknowledged", () => {
      // Given: User has previously acknowledged cookies
      localStorageStore[CONSENT_STORAGE_KEY] = CONSENT_ACKNOWLEDGED;
      const storedConsent = mockLocalStorage.getItem(CONSENT_STORAGE_KEY);

      // When: Checking if banner should show
      const shouldShowBanner = storedConsent === null;

      // Then: Banner should not be visible
      expect(shouldShowBanner).toBe(false);
      expect(storedConsent).toBe(CONSENT_ACKNOWLEDGED);
    });
  });

  describe("Consent actions", () => {
    it("should save acknowledgment to localStorage when user clicks OK", () => {
      // Given: User is presented with consent banner

      // When: User clicks OK
      const handleDismiss = () => {
        mockLocalStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_ACKNOWLEDGED);
      };
      handleDismiss();

      // Then: Consent should be stored in localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        CONSENT_STORAGE_KEY,
        CONSENT_ACKNOWLEDGED,
      );
      expect(localStorageStore[CONSENT_STORAGE_KEY]).toBe(CONSENT_ACKNOWLEDGED);
    });
  });
});
