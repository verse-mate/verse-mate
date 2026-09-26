import type { cache } from "../shared/shared.plugin";
import { clientIp } from "./client-ip";

interface RateLimitOptions {
  /**
   * Time window in seconds
   */
  windowSeconds: number;
  /**
   * Maximum number of requests allowed in the window
   */
  max: number;
  /**
   * Function to extract the key for rate limiting (e.g., IP, email)
   */
  keyGenerator: (context: any) => string;
  /**
   * Error message when rate limit is exceeded
   */
  message?: string;
}

export const createRateLimit = (options: RateLimitOptions) => {
  const {
    windowSeconds,
    max,
    keyGenerator,
    message = "Too many requests, please try again later",
  } = options;

  return async (context: any) => {
    const cache: cache = context.store.cache;
    const key = keyGenerator(context);
    const cacheKey = `rate-limit:${key}`;

    // Get current count
    const cached = await cache.get<{ count: number }>(cacheKey);
    const current = cached?.count || 0;

    if (current >= max) {
      context.set.status = 429;
      const stableMessage =
        typeof message === "string" ? message : "Too many requests";
      // Include cacheKey to allow TTL lookup for retryAfter
      throw { status: 429, message: stableMessage, cacheKey };
    }

    // Increment counter with fixed window TTL
    const newCount = current + 1;
    if (current === 0) {
      // First request in window - set full TTL
      await cache.set(cacheKey, { count: newCount }, `${windowSeconds}s`);
    } else {
      // Preserve remaining TTL to avoid extending window on each hit (sliding window bug)
      const ttlSeconds = await cache.ttl(cacheKey).catch(() => -1);
      if (ttlSeconds > 0) {
        await cache.set(cacheKey, { count: newCount }, `${ttlSeconds}s`);
      } else {
        // If TTL missing or expired, reset a fresh window
        await cache.set(cacheKey, { count: newCount }, `${windowSeconds}s`);
      }
    }
  };
};

// Predefined rate limiters
export const authRateLimiters = {
  login: createRateLimit({
    windowSeconds: 60,
    max: 5,
    keyGenerator: (context) => `login:${context.body.email}`,
    message: "Too many login attempts, please try again in a minute",
  }),

  signup: createRateLimit({
    windowSeconds: 3600,
    max: 3,
    keyGenerator: (context) =>
      `signup:${clientIp(context.request, context.server)}`,
    message: "Too many signup attempts, please try again later",
  }),

  /**
   * Forgot password rate limiter: 3 attempts per email per hour
   */
  forgotPassword: createRateLimit({
    windowSeconds: 3600,
    max: 3,
    keyGenerator: (context) => `forgot-password:${context.body.email}`,
    message: "Too many password reset requests, please try again later",
  }),

  // refresh limiter removed per D-005 — /auth/refresh endpoint deleted.

  sso: createRateLimit({
    windowSeconds: 60,
    max: 10,
    keyGenerator: (context) =>
      `sso:${clientIp(context.request, context.server)}`,
    message: "Too many SSO attempts, please try again in a minute",
  }),

  /**
   * Delete account rate limiter: 3 attempts per user per hour
   * Prevents abuse of account deletion endpoint while allowing legitimate retries
   * if password is incorrect
   */
  deleteAccount: createRateLimit({
    windowSeconds: 3600,
    max: 3,
    keyGenerator: (context) => {
      // Use currentUserId from authDerive
      const userId = context.currentUserId || "unknown";
      return `delete-account:${userId}`;
    },
    message: "Too many deletion attempts, please try again later",
  }),
};
