import { timingSafeEqual } from "node:crypto";

/**
 * The link between Class Setup and the VerseMate notetaker (the bot that joins
 * and records each class; ThorSPB/notetaker, its gateway at NOTETAKER_URL).
 *
 *   - The notetaker reads every class to record from GET /coach/notetaker/classes,
 *     with NOTETAKER_VERSEMATE_TOKEN as its bearer.
 *   - After any class changes, the backend tells it so (POST
 *     /versemate/classes-changed) and it reads the list again. No polling.
 *   - The admin screen asks it which coaches connected their Zoom account and
 *     what those coaches have scheduled (GET /versemate/zoom).
 *
 * Both variables unset (local dev, tests): the feed refuses every caller and
 * nothing is sent.
 */
export const NOTETAKER_URL = "NOTETAKER_URL";
export const NOTETAKER_TOKEN = "NOTETAKER_VERSEMATE_TOKEN";

/** Where a coach connects their Zoom account; returns them to versemate.org. */
export const NOTETAKER_CONNECT_URL =
  "https://notetaker.thorsp.net/zoom/install?from=versemate";

const TIMEOUT_MS = 8000;

function config(): { url: string; token: string } | null {
  const url = (process.env[NOTETAKER_URL] ?? "").trim().replace(/\/+$/, "");
  const token = (process.env[NOTETAKER_TOKEN] ?? "").trim();
  return url && token ? { url, token } : null;
}

/** True when `authorization` is "Bearer <NOTETAKER_VERSEMATE_TOKEN>". */
export function notetakerTokenOk(authorization: string | undefined): boolean {
  const token = (process.env[NOTETAKER_TOKEN] ?? "").trim();
  if (!token || !authorization) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Tell the notetaker the class list changed. Never throws: the class is
 *  saved either way, and the notetaker re-reads the list when it restarts. */
export async function pingNotetaker(fetchImpl: Fetch = fetch): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  try {
    const res = await fetchImpl(`${cfg.url}/versemate/classes-changed`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await res.body?.cancel();
    if (!res.ok)
      console.error(`[COACH-NOTETAKER] classes-changed answered ${res.status}`);
  } catch (err) {
    console.error("[COACH-NOTETAKER] classes-changed not delivered:", err);
  }
}

/** A coach who connected their Zoom account to the notetaker. */
export interface NotetakerConnection {
  email: string;
  name: string;
  connectedAt: string | null;
}

/** A scheduled meeting of a connected coach, in Class Setup's terms. */
export interface NotetakerMeeting {
  meetingId: string;
  topic: string;
  joinUrl: string;
  hostEmail: string;
  classDate: string | null;
  startTime: string | null;
  timeZone: string | null;
  recurrence: string;
  invited: boolean;
}

export interface NotetakerZoom {
  connections: NotetakerConnection[];
  meetings: NotetakerMeeting[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

/** The notetaker's connected coaches and their meetings; null when it is not
 *  configured or does not answer. */
export async function notetakerZoom(
  fetchImpl: Fetch = fetch,
): Promise<NotetakerZoom | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const res = await fetchImpl(`${cfg.url}/versemate/zoom`, {
      headers: { authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      console.error(`[COACH-NOTETAKER] zoom list answered ${res.status}`);
      return null;
    }
    const body = (await res.json()) as {
      connections?: Record<string, unknown>[];
      meetings?: Record<string, unknown>[];
    };
    return {
      connections: (body.connections ?? []).map((c) => ({
        email: str(c.email).toLowerCase(),
        name: str(c.name),
        connectedAt: strOrNull(c.connected_at),
      })),
      meetings: (body.meetings ?? []).map((m) => ({
        meetingId: str(m.meeting_id),
        topic: str(m.topic),
        joinUrl: str(m.join_url),
        hostEmail: str(m.host_email).toLowerCase(),
        classDate: strOrNull(m.class_date),
        startTime: strOrNull(m.start_time),
        timeZone: strOrNull(m.time_zone),
        recurrence: str(m.recurrence) || "none",
        invited: m.invited === true,
      })),
    };
  } catch (err) {
    console.error("[COACH-NOTETAKER] zoom list not available:", err);
    return null;
  }
}

/** The meeting id in a Zoom join link (zoom.us/j/<id>, /w/, /s/, any
 *  subdomain), or null for anything else. */
export function zoomMeetingId(link: string): string | null {
  const m = /zoom\.us\/(?:j|w|s)\/(\d+)/i.exec(link);
  return m?.[1] ?? null;
}

/** True when `zone` is an IANA time zone this runtime knows. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
