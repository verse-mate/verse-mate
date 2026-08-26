/**
 * Scoped service credential for the coach publish path (change:
 * coach-reports-store, decision 2026-08-25).
 *
 * The publisher (the coaching pipeline host) authenticates with a dedicated
 * token that grants ONE capability — publish coach reports — rather than acting
 * as a program admin. Least privilege: if the publishing host is compromised the
 * blast radius is "can publish coach data", not full admin authority, and this
 * stays independent of the account/admin-role model.
 *
 * The token lives in `COACH_PUBLISH_TOKEN`. Absent or empty means the publish
 * path is disabled and every ingest call is rejected — fail closed, never
 * "no token configured so allow".
 */

/** Constant-time compare so a wrong token can't be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Pull the bearer value out of an Authorization header. */
export function bearerFrom(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : null;
}

/**
 * True when the request carries the configured publish credential.
 * Fails closed when the credential is not configured.
 */
export function hasPublishScope(authorization: string | undefined): boolean {
  const configured = process.env.COACH_PUBLISH_TOKEN;
  if (!configured || configured.trim().length === 0) return false;
  const presented = bearerFrom(authorization);
  if (!presented) return false;
  return safeEqual(presented, configured.trim());
}
