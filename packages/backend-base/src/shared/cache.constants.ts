function resetPassword(key: string): string {
  return `resetPassword:${key}`;
}

function accessToken(key: string): string {
  return `accessToken:${key}`;
}

function verifyEmail(key: string): string {
  return `verifyEmail:${key}`;
}

function emailChangeKey(hash: string): string {
  return `emailChange:key:${hash}`;
}

function emailChangePending(userId: string): string {
  return `emailChange:pending:${userId}`;
}

function emailChangeTries(hash: string): string {
  return `emailChange:tries:${hash}`;
}

function emailChangeMailsSent(userId: string): string {
  return `rate-limit:email-change:${userId}`;
}

function emailChangeRequests(userId: string): string {
  return `rate-limit:email-change-requests:${userId}`;
}

function emailChangeMailsTo(addressHash: string): string {
  return `rate-limit:email-change-to:${addressHash}`;
}

function emailChangeMailing(requestId: string): string {
  return `emailChange:mailing:${requestId}`;
}

function emailChangeRevert(hash: string): string {
  return `emailChange:revert:${hash}`;
}

function emailChangeReverts(userId: string): string {
  return `emailChange:reverts:${userId}`;
}

function emailChangeReserved(addressHash: string): string {
  return `emailChange:reserved:${addressHash}`;
}

function emailChangeDone(hash: string): string {
  return `emailChange:done:${hash}`;
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

function ssoExchangeCode(code: string): string {
  const env = process.env.NODE_ENV ?? "dev";
  return `${env}:ssoCode:${code}`;
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
  emailChangeKey,
  emailChangePending,
  emailChangeTries,
  emailChangeMailsSent,
  emailChangeRequests,
  emailChangeMailsTo,
  emailChangeMailing,
  emailChangeDone,
  emailChangeRevert,
  emailChangeReverts,
  emailChangeReserved,
  ssoState,
  ssoExchangeCode,
  dailyVersePick,
};

export default cacheConstants;
