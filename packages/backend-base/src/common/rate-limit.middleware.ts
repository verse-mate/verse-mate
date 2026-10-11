import type { cache } from "../shared/shared.plugin";
import { clientIp, trustedProxyHops } from "./client-ip";

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

    const count = await cache.increment(cacheKey, windowSeconds);

    if (count > max) {
      context.set.status = 429;
      const stableMessage =
        typeof message === "string" ? message : "Too many requests";
      // Include cacheKey to allow TTL lookup for retryAfter
      throw { status: 429, message: stableMessage, cacheKey };
    }
  };
};

const normalizedEmail = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const onceProxyHopsAreSet =
  (limit: (context: any) => Promise<void>) => async (context: any) => {
    if (trustedProxyHops() !== null) await limit(context);
  };

// Predefined rate limiters
export const authRateLimiters = {
  login: onceProxyHopsAreSet(
    createRateLimit({
      windowSeconds: 60,
      max: 5,
      keyGenerator: (context) =>
        `login:${normalizedEmail(context.body?.email)}:${clientIp(context.request, context.server)}`,
      message: "Too many login attempts, please try again in a minute",
    }),
  ),

  loginIp: onceProxyHopsAreSet(
    createRateLimit({
      windowSeconds: 60,
      max: 30,
      keyGenerator: (context) =>
        `login-ip:${clientIp(context.request, context.server)}`,
      message: "Too many login attempts, please try again in a minute",
    }),
  ),

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

  sendEmailVerification: createRateLimit({
    windowSeconds: 3600,
    max: 5,
    keyGenerator: (context) =>
      `send-email-verification:${context.currentUserId || "unknown"}`,
    message: "Too many confirmation emails, please try again later",
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
