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

const cacheConstants = {
  resetPassword,
  accessToken,
  verifyEmail,
  ssoState,
};

export default cacheConstants;
