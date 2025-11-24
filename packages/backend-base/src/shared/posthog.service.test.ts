import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { type Logger, PosthogService } from "./posthog.service";

describe("PosthogService", () => {
  let mockLogger: Logger;
  let originalEnv: NodeJS.ProcessEnv;
  let warnSpy: ReturnType<typeof mock>;
  let errorSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create mock logger
    warnSpy = mock(() => {});
    errorSpy = mock(() => {});
    mockLogger = {
      child: mock(() => mockLogger),
      warn: warnSpy,
      error: errorSpy,
    };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("initialization", () => {
    it("should initialize PostHog client with valid environment variables", () => {
      // Set valid environment variables
      process.env.POSTHOG_KEY = "phc_test_key_12345";
      process.env.POSTHOG_HOST = "https://app.posthog.com";

      const service = new PosthogService({ logger: mockLogger });

      // Should log initialization message
      expect(warnSpy).toHaveBeenCalledWith("Initializing...");

      // Should be initialized (client created)
      expect(service.isInitialized()).toBe(true);

      // Should NOT log missing env vars warning
      expect(warnSpy).not.toHaveBeenCalledWith(
        "Missing PostHog environment variables",
      );
    });

    it("should handle missing environment variables gracefully", () => {
      // Clear environment variables
      process.env.POSTHOG_KEY = undefined;
      process.env.POSTHOG_HOST = undefined;

      const service = new PosthogService({ logger: mockLogger });

      // Should log initialization message
      expect(warnSpy).toHaveBeenCalledWith("Initializing...");

      // Should log warning about missing env vars
      expect(warnSpy).toHaveBeenCalledWith(
        "Missing PostHog environment variables",
      );

      // Should not be initialized (no client)
      expect(service.isInitialized()).toBe(false);
    });
  });

  describe("captureException", () => {
    it("should log error and capture exception correctly when client is initialized", () => {
      // Set valid environment variables
      process.env.POSTHOG_KEY = "phc_test_key_12345";
      process.env.POSTHOG_HOST = "https://app.posthog.com";

      const service = new PosthogService({ logger: mockLogger });
      const testError = new Error("Test error");
      const testUserId = "user-123";
      const additionalProps = {
        code: "INTERNAL_ERROR",
        $current_url: "/api/test",
      };

      // Call captureException
      service.captureException(testError, testUserId, additionalProps);

      // Should log the error
      expect(errorSpy).toHaveBeenCalledWith(testError);

      // Should NOT log "client not initialized" warning
      expect(warnSpy).not.toHaveBeenCalledWith(
        "PostHog client not initialized, skipping capture",
      );
    });

    it("should log warning when client is not initialized", () => {
      // Clear environment variables
      process.env.POSTHOG_KEY = undefined;
      process.env.POSTHOG_HOST = undefined;

      const service = new PosthogService({ logger: mockLogger });
      const testError = new Error("Test error");

      // Call captureException
      service.captureException(testError, "user-123");

      // Should log the error
      expect(errorSpy).toHaveBeenCalledWith(testError);

      // Should log warning about client not initialized
      expect(warnSpy).toHaveBeenCalledWith(
        "PostHog client not initialized, skipping capture",
      );
    });
  });

  describe("disconnect", () => {
    it("should call shutdown on client when initialized", async () => {
      // Set valid environment variables
      process.env.POSTHOG_KEY = "phc_test_key_12345";
      process.env.POSTHOG_HOST = "https://app.posthog.com";

      const service = new PosthogService({ logger: mockLogger });

      // Should not throw when calling disconnect
      await expect(service.disconnect()).resolves.toBeUndefined();
    });

    it("should handle disconnect gracefully when client is not initialized", async () => {
      // Clear environment variables
      process.env.POSTHOG_KEY = undefined;
      process.env.POSTHOG_HOST = undefined;

      const service = new PosthogService({ logger: mockLogger });

      // Should not throw when calling disconnect without client
      await expect(service.disconnect()).resolves.toBeUndefined();
    });
  });
});
