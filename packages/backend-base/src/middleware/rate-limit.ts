import type { Context } from "elysia";

const WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

type RateLimitHandler = (args: {
  request: Request;
  set: Context["set"];
}) => { error: string; message: string } | undefined;

/**
 * Creates an IP-based fixed-window rate limiter handler.
 *
 * Each created limiter keeps its own request-count window map, so applying
 * different limiters to different routes does not share counters.
 *
 * @param maxRequests - Maximum requests allowed per IP within the 60s window.
 */
export function createIpRateLimit(
  maxRequests: number = DEFAULT_MAX_REQUESTS,
): RateLimitHandler {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return ({ request, set }) => {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const now = Date.now();
    const entry = windows.get(ip);

    if (!entry || now >= entry.resetAt) {
      windows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }

    entry.count++;
    if (entry.count > maxRequests) {
      set.status = 429;
      return { error: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" };
    }
  };
}

/**
 * Default IP rate limiter (100 requests/minute).
 *
 * Backward-compatible bare handler for callers that use it directly as
 * `beforeHandle: ipRateLimit`. New routes that need a custom limit should use
 * `createIpRateLimit(maxRequests)` instead.
 */
export const ipRateLimit: RateLimitHandler = createIpRateLimit();
