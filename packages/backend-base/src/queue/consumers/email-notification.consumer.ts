import { isSingleRecipient } from "../../common/email-address";
import { safePromise } from "../../shared/utils/safe-promise";

export interface MailData {
  subject: string;
  to: {
    name: string;
    email: string;
  };
  /**
   * The display name to send under. The ADDRESS is always `EMAIL_FROM`: Gmail
   * rewrites a From address that is neither the authorised mailbox nor one of
   * its verified "send mail as" aliases, so honouring another one here would
   * only make the header lie until Gmail corrected it.
   */
  from?: {
    name: string;
    email: string;
  };
  /**
   * Where a reply should go, when that is not the From address.
   *
   * Added for coaching delivery (task 6.3a): leaders replying to a report
   * should reach the coach mailbox, which need not be the sending one.
   */
  replyTo?: {
    name: string;
    email: string;
  };
  text: string;
  html?: string;
}

/**
 * What happened to a send.
 *
 * A RESULT, deliberately, not a thrown error. `auth.service.ts:574` fires the
 * password-reset mail WITHOUT awaiting it, so a throwing sender would surface
 * as an unhandled rejection on a path that is otherwise fine. Every existing
 * caller may ignore this and behave exactly as before; the coaching paths
 * (6.3, 6.5, 6.9) check it, because "confirm three sends" and "reported rather
 * than reported as delivered" are unverifiable if no caller can tell.
 */
export interface SendResult {
  delivered: boolean;
  /** True when the environment does not send at all (dev/test). */
  suppressed?: boolean;
  status?: number;
  error?: string;
}

/** One HTTP call to Google (token or send) never waits longer than this. */
export const EMAIL_TIMEOUT_MS = 30_000;

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const CONFIG = [
  "EMAIL_FROM",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
] as const;
const DEFAULT_FROM_NAME = "VerseMate";
/** Refresh the access token this long before Google says it expires. */
const TOKEN_EARLY_MS = 60_000;

const CONTROL_CHARACTER = /\p{Cc}/u;
const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

/** RFC 2047 encoded-word, for header text that isn't plain ASCII. */
function encodedWord(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function mailbox(person: { name: string; email: string }): string {
  const name = ASCII_PRINTABLE.test(person.name)
    ? `"${person.name.replace(/["\\]/g, "\\$&")}"`
    : encodedWord(person.name);
  return `${name} <${person.email}>`;
}

function headerText(text: string): string {
  return ASCII_PRINTABLE.test(text) ? text : encodedWord(text);
}

/** Base64 body lines of at most 76 characters (RFC 2045). */
function base64Body(text: string): string {
  return (
    Buffer.from(text, "utf8")
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") ?? ""
  );
}

function part(type: "plain" | "html", content: string): string {
  return [
    `Content-Type: text/${type}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(content),
  ].join("\r\n");
}

/** The RFC 5322 message Gmail sends: text, or text and HTML as alternatives. */
export function buildMessage(
  data: MailData,
  from: { name: string; email: string },
): string {
  const domain = from.email.split("@").pop() ?? "localhost";
  const headers = [
    `From: ${mailbox(from)}`,
    `To: ${mailbox(data.to)}`,
    ...(data.replyTo ? [`Reply-To: ${mailbox(data.replyTo)}`] : []),
    `Subject: ${headerText(data.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
  ];
  if (!data.html)
    return [...headers, part("plain", data.text)].join("\r\n").concat("\r\n");
  const boundary = `vm-${crypto.randomUUID()}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    part("plain", data.text),
    `--${boundary}`,
    part("html", data.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function refusal(data: MailData): string | null {
  if (!isSingleRecipient(data.to.email))
    return "refused: the recipient is not one plain email address";
  if (CONTROL_CHARACTER.test(data.to.name))
    return "refused: the recipient name has a control character";
  for (const [role, person] of [
    ["sender", data.from],
    ["reply-to", data.replyTo],
  ] as const) {
    if (!person) continue;
    if (!isSingleRecipient(person.email))
      return `refused: the ${role} is not one plain email address`;
    if (CONTROL_CHARACTER.test(person.name))
      return `refused: the ${role} name has a control character`;
  }
  if (CONTROL_CHARACTER.test(data.subject))
    return "refused: the subject has a control character";
  return null;
}

/** Google's error text, from either the OAuth or the Gmail error shape. */
function googleError(json: unknown, fallback: string): string {
  const body = json as {
    error?: string | { message?: string };
    error_description?: string;
  } | null;
  if (body?.error && typeof body.error === "object" && body.error.message)
    return body.error.message;
  if (typeof body?.error === "string")
    return body.error_description
      ? `${body.error}: ${body.error_description}`
      : body.error;
  return fallback;
}

/**
 * Sends mail through Google Workspace: the Gmail API, as one mailbox, with an
 * OAuth refresh token for it (`gmail.send`). This is how the coaching program
 * already sends from coach@versemate.org.
 *
 * Production and staging send; every other environment logs a line that names
 * no one and reports the send as suppressed. A production instance missing its
 * mail settings still starts: it logs which settings are missing and every send
 * reports `delivered: false`, the same as when the sender was misconfigured
 * before, rather than taking the whole API down at boot.
 */
export class EmailNotificationConsumer {
  private readonly environment: string;
  private readonly from: { name: string; email: string } | null;
  private readonly missing: string[];
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor() {
    console.log(`[${EmailNotificationConsumer.name}]: Initializing...`);

    this.environment = process.env.ENVIRONMENT ?? "";
    const env = (key: (typeof CONFIG)[number]) =>
      (process.env[key] ?? "").trim();
    this.missing = CONFIG.filter((key) => !env(key));
    const emailFrom = env("EMAIL_FROM");
    this.from = isSingleRecipient(emailFrom)
      ? {
          name: (process.env.EMAIL_FROM_NAME ?? "").trim() || DEFAULT_FROM_NAME,
          email: emailFrom,
        }
      : null;
    if (emailFrom && !this.from)
      this.missing.push("EMAIL_FROM (not one address)");
    this.clientId = env("GMAIL_CLIENT_ID");
    this.clientSecret = env("GMAIL_CLIENT_SECRET");
    this.refreshToken = env("GMAIL_REFRESH_TOKEN");

    if (this.sends() && this.missing.length)
      console.error(
        `[${EmailNotificationConsumer.name}]: mail is not configured, nothing will be sent; missing: ${this.missing.join(", ")}`,
      );
  }

  private sends(): boolean {
    return ["production", "staging"].includes(this.environment);
  }

  /** A cached access token, refreshed from the refresh token when due. */
  private async token(force = false): Promise<string> {
    if (
      !force &&
      this.accessToken &&
      Date.now() < this.accessToken.expiresAt - TOKEN_EARLY_MS
    )
      return this.accessToken.value;
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    const [json] = await safePromise<{
      access_token?: string;
      expires_in?: number;
    }>(res.json());
    if (res.status !== 200 || !json?.access_token)
      throw new Error(
        `token refresh failed (${res.status}): ${googleError(json, res.statusText || "no access token")}`,
      );
    this.accessToken = {
      value: json.access_token,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    };
    return this.accessToken.value;
  }

  private async post(raw: string, token: string): Promise<Response> {
    return fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
  }

  async sendEmail(data: MailData): Promise<SendResult> {
    const refused = refusal(data);
    if (refused) return { delivered: false, error: refused };
    if (!this.sends()) {
      console.debug(
        `[${EmailNotificationConsumer.name}]: not sent in ${this.environment}: to @${data.to.email.split("@").pop()}, subject of ${data.subject.length} characters`,
      );
      return { delivered: false, suppressed: true };
    }
    if (this.missing.length || !this.from)
      return {
        delivered: false,
        error: `mail is not configured (missing ${this.missing.join(", ")})`,
      };

    const from = {
      name: data.from?.name?.trim() || this.from.name,
      email: this.from.email,
    };
    const raw = Buffer.from(buildMessage(data, from), "utf8").toString(
      "base64url",
    );
    try {
      let res = await this.post(raw, await this.token());
      // A token revoked or rotated server-side before its stated expiry: one
      // fresh token, one retry, then the failure is the caller's to see.
      if (res.status === 401)
        res = await this.post(raw, await this.token(true));
      if (res.status === 200) return { delivered: true, status: 200 };
      const [json] = await safePromise<unknown>(res.json());
      const error = googleError(
        json,
        res.statusText || "unknown mail api error",
      );
      console.log(
        `[${EmailNotificationConsumer.name}]: Send email error: ${error}`,
      );
      return { delivered: false, status: res.status, error };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(
        `[${EmailNotificationConsumer.name}]: Send email error: ${message}`,
      );
      return { delivered: false, error: message };
    }
  }
}
