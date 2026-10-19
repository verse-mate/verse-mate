/**
 * The coaching recorder ("VerseMate Notetaker"): a Zoom app plus a bot that joins
 * the classes a coach invites it to. Its gateway (OAuth, webhooks, policies) runs
 * outside this site; these pages are where coaches connect their Zoom account.
 */

/** Starts Zoom's sign-in; after "Allow", the gateway sends the coach to /coach/notetaker/connected/. */
export const NOTETAKER_CONNECT_URL =
  "https://notetaker.thorsp.net/zoom/install?from=versemate";

/** The address a coach invites to each class (Zoom "Invitees" or a calendar invitation). */
export const NOTETAKER_INVITE_ADDRESS = "notetaker@coaching.versemate.org";

export const NOTETAKER_SUPPORT_ADDRESS = "support@coaching.versemate.org";

const GATEWAY = "https://notetaker.thorsp.net";
export const NOTETAKER_LINKS = {
  privacy: `${GATEWAY}/privacy`,
  terms: `${GATEWAY}/terms`,
  guide: `${GATEWAY}/guide`,
};
