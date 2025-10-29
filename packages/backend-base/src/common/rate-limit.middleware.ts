import type { cache } from "../shared/shared.plugin";

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
      throw new Error(message);
    }

    // Increment counter
    const newCount = current + 1;
    await cache.set(cacheKey, { count: newCount }, `${windowSeconds}s`);
  };
};

// Predefined rate limiters
export const authRateLimiters = {
  /**
   * Login rate limiter: 5 attempts per email per minute
   */
  login: createRateLimit({
    windowSeconds: 60,
    max: 5,
    keyGenerator: (context) => `login:${context.body.email}`,
    message: "Too many login attempts, please try again in a minute",
  }),

  /**
   * Signup rate limiter: 3 signups per IP per hour
   */
  signup: createRateLimit({
    windowSeconds: 3600,
    max: 3,
    keyGenerator: (context) => {
      const ip =
        context.request.headers.get("x-forwarded-for") ||
        context.request.headers.get("x-real-ip") ||
        "unknown";
      return `signup:${ip}`;
    },
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

  /**
   * Refresh token rate limiter: 20 refreshes per minute per user
   */
  refresh: createRateLimit({
    windowSeconds: 60,
    max: 20,
    keyGenerator: (context) => {
      // Use refresh token as key (unique per session)
      const token = context.body.refreshToken || "unknown";
      // Hash to avoid storing full token in cache key
      return `refresh:${token.substring(0, 10)}`;
    },
    message: "Too many refresh attempts, please try again later",
  }),
};
