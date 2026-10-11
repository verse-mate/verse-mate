import { createHash } from "node:crypto";

import type { cache } from "../shared/shared.plugin";
import { clientBucket, trustedProxyHops } from "./client-ip";

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

  return async ({ server, ...context }: any) => {
    const cache: cache = context.store.cache;
    const key = keyGenerator({ ...context, server });
    const cacheKey = `rate-limit:${key}`;

    const count = await cache.increment(cacheKey, windowSeconds);

    if (count > max) {
      context.set.status = 429;
      const stableMessage =
        typeof message === "string" ? message : "Too many requests";
      const retryAfter = await cache.ttl(cacheKey).catch(() => -1);
      throw {
        status: 429,
        message: stableMessage,
        ...(retryAfter > 0 ? { retryAfter } : {}),
      };
    }
  };
};

const emailDigest = (value: unknown): string =>
  createHash("sha256")
    .update(String(value ?? ""))
    .digest("base64url");

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
        `login:${emailDigest(normalizedEmail(context.body?.email))}:${clientBucket(context.request, context.server)}`,
      message: "Too many login attempts, please try again in a minute",
    }),
  ),

  loginIp: onceProxyHopsAreSet(
    createRateLimit({
      windowSeconds: 60,
      max: 30,
      keyGenerator: (context) =>
        `login-ip:${clientBucket(context.request, context.server)}`,
      message: "Too many login attempts, please try again in a minute",
    }),
  ),

  signup: createRateLimit({
    windowSeconds: 3600,
    max: 3,
    keyGenerator: (context) =>
      `signup:${clientBucket(context.request, context.server)}`,
    message: "Too many signup attempts, please try again later",
  }),

  /**
   * Forgot password rate limiter: 3 attempts per email per hour
   */
  forgotPassword: createRateLimit({
    windowSeconds: 3600,
    max: 3,
    keyGenerator: (context) =>
      `forgot-password:${emailDigest(context.body.email)}`,
    message: "Too many password reset requests, please try again later",
  }),

  // refresh limiter removed per D-005 — /auth/refresh endpoint deleted.

  sso: createRateLimit({
    windowSeconds: 60,
    max: 10,
    keyGenerator: (context) =>
      `sso:${clientBucket(context.request, context.server)}`,
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
