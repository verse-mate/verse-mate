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
 * Used in SSO redirect/callback flow
 */
function ssoState(state: string): string {
  return `ssoState:${state}`;
}

const cacheConstants = {
  resetPassword,
  accessToken,
  verifyEmail,
  ssoState,
};

export default cacheConstants;
