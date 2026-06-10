function resetPassword(key: string): string {
  return `resetPassword:${key}`;
}

function accessToken(key: string): string {
  return `accessToken:${key}`;
}

function verifyEmail(key: string): string {
  return `verifyEmail:${key}`;
}

/**
 * OAuth state parameter for CSRF protection
 * Used in SSO redirect/callback flow.
 * Includes environment namespace to prevent collisions across environments.
 * Callers should set a short TTL (5-10 minutes).
 */
function ssoState(state: string): string {
  const env = process.env.NODE_ENV ?? "dev";
  return `${env}:ssoState:${state}`;
}

/**
 * Verse-of-the-Day selected pick for a date. `userId` is null in v1 (global
 * pick) and carries the user id in v2 personalization, so the key shape is
 * forward-compatible without a re-plumb (D-36).
 */
function dailyVersePick(date: string, userId: string | null): string {
  return `dailyVersePick:${date}:${userId ?? "global"}`;
}

const cacheConstants = {
  resetPassword,
  accessToken,
  verifyEmail,
  ssoState,
  dailyVersePick,
};

export default cacheConstants;
