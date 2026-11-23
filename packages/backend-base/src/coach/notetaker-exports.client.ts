import { type ArchiveDeps, pinnedFetch } from "./coach-archive.service";
import { NOTETAKER_URL } from "./coach-notetaker";
import { NOTETAKER_SESSION_PREFIX } from "./coach-session-state";
import {
  type FirefliesDetailClient,
  type FirefliesTranscript,
  type FirefliesTranscriptDetail,
  isLeaderLabel,
} from "./fireflies.client";

/**
 * The notetaker's exports, read as a shadow of the Fireflies bot.
 *
 * The VerseMate notetaker (ThorSPB/notetaker) leaves one export per class it
 * recorded, and its gateway serves them read-only: GET /exports lists them,
 * GET /exports/<bot>/<file> serves transcript.json, meta.json and
 * recording.mp4. This client reads them through the same interfaces intake and
 * the archive use for Fireflies, so a notetaker session is retained, stored
 * and scored exactly like the bot's copy of the same class, and the two can be
 * compared side by side (GET /coach/admin/notetaker/comparison).
 *
 * OFF unless COACH_NOTETAKER_SHADOW is "true" and NOTETAKER_URL and
 * NOTETAKER_EXPORT_TOKEN are both set. The exports have their own token, not
 * NOTETAKER_VERSEMATE_TOKEN: that one lets the notetaker read VerseMate's class
 * list, this one lets VerseMate read the notetaker's recordings. A shadow
 * session is never sent to a leader (see coach-session-state.ts).
 *
 * COACH_NOTETAKER_SINCE (YYYY-MM-DD, America/Chicago) leaves out every session
 * before it, so turning the shadow on does not score the whole backlog.
 *
 * Names: the exports carry the participants and each speaker's name. Like the
 * Fireflies client, this one uses a name once, here, to mark which speaker is
 * the leader, and passes on only numbered speakers. No name leaves this file.
 */

export const COACH_NOTETAKER_SHADOW = "COACH_NOTETAKER_SHADOW";
export const NOTETAKER_EXPORT_TOKEN = "NOTETAKER_EXPORT_TOKEN";
export const COACH_NOTETAKER_SINCE = "COACH_NOTETAKER_SINCE";

export interface NotetakerShadowConfig {
  /** The gateway, no trailing slash. https, default port. */
  url: string;
  /** Its host name, the only one the shadow's archive fetches video from. */
  host: string;
  token: string;
  /** YYYY-MM-DD, or null for every session the gateway lists. */
  since: string | null;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** COACH_NOTETAKER_SINCE when it reads as a date, else null. */
export function notetakerSinceSetting(): string | null {
  const since = (process.env[COACH_NOTETAKER_SINCE] ?? "").trim();
  return isCalendarDate(since) ? since : null;
}

/**
 * The shadow's settings, or null when it is off.
 *
 * Switched on but misconfigured is also null, and says why on every tick: a
 * shadow that silently records nothing reads exactly like a quiet week. An
 * unreadable COACH_NOTETAKER_SINCE keeps it off rather than falling back to
 * the whole backlog, which is the expensive mistake.
 */
export function notetakerShadowConfig(): NotetakerShadowConfig | null {
  const on = (process.env[COACH_NOTETAKER_SHADOW] ?? "").trim().toLowerCase();
  if (on !== "true") return null;
  const off = (why: string) => {
    console.error(`[COACH-NOTETAKER-SHADOW] on, but not running: ${why}`);
    return null;
  };
  const url = (process.env[NOTETAKER_URL] ?? "").trim().replace(/\/+$/, "");
  const token = (process.env[NOTETAKER_EXPORT_TOKEN] ?? "").trim();
  if (!url || !token)
    return off(
      `${NOTETAKER_URL} and ${NOTETAKER_EXPORT_TOKEN} must both be set`,
    );
  const parsed = URL.canParse(url) ? new URL(url) : null;
  if (!parsed) return off(`${NOTETAKER_URL} is not a URL`);
  // The token travels with every request, and the archive fetches video only
  // over https on the default port.
  if (parsed.protocol !== "https:" || parsed.port !== "")
    return off(`${NOTETAKER_URL} must be https on the default port`);
  const since = (process.env[COACH_NOTETAKER_SINCE] ?? "").trim();
  if (since && !isCalendarDate(since))
    return off(`${COACH_NOTETAKER_SINCE} must be a date like 2026-12-01`);
  return {
    url,
    host: parsed.hostname.toLowerCase(),
    token,
    since: since || null,
  };
}

/** Export folder names: no dot, no slash, nothing that walks a path. */
const BOT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function notetakerSessionId(bot: string): string {
  return `${NOTETAKER_SESSION_PREFIX}${bot}`;
}

/** The export folder a notetaker session id names, or null for any other id. */
export function notetakerBot(sourceSessionId: string): string | null {
  if (!sourceSessionId.startsWith(NOTETAKER_SESSION_PREFIX)) return null;
  const bot = sourceSessionId.slice(NOTETAKER_SESSION_PREFIX.length);
  return BOT_ID.test(bot) ? bot : null;
}

export class NotetakerExportsError extends Error {}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 30_000;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

interface Utterance {
  speaker_name?: unknown;
  speaker_uuid?: unknown;
  speaker_is_host?: unknown;
  timestamp_ms?: unknown;
  duration_ms?: unknown;
  transcription?: { transcript?: unknown } | null;
}

const seconds = (ms: number) => Math.round(ms) / 1000;

export class NotetakerExportsClient implements FirefliesDetailClient {
  private listed: Promise<FirefliesTranscript[]> | null = null;

  constructor(
    private readonly cfg: Pick<NotetakerShadowConfig, "url" | "token">,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async get(path: string): Promise<Response> {
    return this.fetchImpl(`${this.cfg.url}${path}`, {
      headers: { authorization: `Bearer ${this.cfg.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private async json(path: string): Promise<unknown | null> {
    const res = await this.get(path);
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new NotetakerExportsError(
        `notetaker ${path} answered ${res.status}`,
      );
    }
    return res.json();
  }

  /** Every finished export, mapped to the lean list shape. Read once. */
  private all(): Promise<FirefliesTranscript[]> {
    this.listed ??= (async () => {
      const body = await this.json("/exports");
      if (!Array.isArray(body))
        throw new NotetakerExportsError("notetaker /exports is not a list");
      const out: FirefliesTranscript[] = [];
      for (const raw of body as Record<string, unknown>[]) {
        const bot = str(raw?.bot);
        if (!BOT_ID.test(bot)) continue;
        // A session still being written has no transcript yet; the next poll
        // sees it once it does.
        const files = raw.files;
        if (Array.isArray(files) && !files.includes("transcript.json"))
          continue;
        const dateString = str(raw.date_string);
        if (Number.isNaN(new Date(dateString).getTime())) continue;
        out.push({
          id: notetakerSessionId(bot),
          title: str(raw.title),
          host_email: null,
          organizer_email: null,
          dateString,
          duration: num(raw.duration_min),
        });
      }
      return out.sort((a, b) =>
        a.dateString === b.dateString
          ? a.id.localeCompare(b.id)
          : new Date(a.dateString).getTime() - new Date(b.dateString).getTime(),
      );
    })();
    return this.listed;
  }

  async listTranscripts(opts: {
    since: Date | null;
    limit: number;
    skip?: number;
  }): Promise<FirefliesTranscript[]> {
    const since = opts.since?.getTime() ?? null;
    const skip = opts.skip ?? 0;
    return (await this.all())
      .filter(
        (t) => since === null || new Date(t.dateString).getTime() >= since,
      )
      .slice(skip, skip + opts.limit);
  }

  async getTranscript(
    id: string,
    leaderName: string | null,
  ): Promise<FirefliesTranscriptDetail | null> {
    const bot = notetakerBot(id);
    if (!bot) return null;
    const folder = `/exports/${encodeURIComponent(bot)}`;
    const meta = (await this.json(`${folder}/meta.json`)) as Record<
      string,
      unknown
    > | null;
    if (!meta) return null;
    const transcript = (await this.json(`${folder}/transcript.json`)) as {
      recording_start_ms?: unknown;
      utterances?: unknown;
    } | null;
    if (!transcript) return null;

    const utterances = (
      Array.isArray(transcript.utterances) ? transcript.utterances : []
    ) as Utterance[];
    const spoken = utterances
      .map((u) => ({
        u,
        at: num(u.timestamp_ms),
        text: str(u.transcription?.transcript).trim(),
      }))
      .filter((s) => s.text.length > 0)
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    const start =
      num(transcript.recording_start_ms) ??
      spoken.find((s) => s.at !== null)?.at ??
      0;

    // Names resolve to pseudonyms HERE and go no further. One number per
    // distinct speaker (the meeting's own id for them when it gives one).
    const pseudonyms = new Map<string, string>();
    const names = new Map<string, string>();
    const hosts = new Set<string>();
    const keyOf = (u: Utterance) => {
      const name = str(u.speaker_name).trim();
      const key = str(u.speaker_uuid).trim() || `name:${name.toLowerCase()}`;
      if (!pseudonyms.has(key)) {
        pseudonyms.set(key, `speaker-${pseudonyms.size + 1}`);
        names.set(key, name);
      }
      if (u.speaker_is_host === true) hosts.add(key);
      return key;
    };
    const keyed = spoken.map((s) => ({ ...s, key: keyOf(s.u) }));

    // The leader is the speaker whose name is the attributed leader's, as for
    // Fireflies. When no name matches (a display name like "iPad"), the
    // meeting's host is: the leader connected their own Zoom to the
    // notetaker. With no attributed leader (a rotating class not yet named)
    // nobody is marked, again as for Fireflies.
    const leader = (leaderName ?? "").trim();
    const byName = new Set(
      leader
        ? [...names].filter(([, n]) => isLeaderLabel(n, leader)).map(([k]) => k)
        : [],
    );
    const leaders = !leader ? new Set<string>() : byName.size ? byName : hosts;

    const sentences = keyed.map((s, index) => {
      const at = s.at === null ? null : seconds(Math.max(0, s.at - start));
      const lasted = num(s.u.duration_ms);
      return {
        index,
        speakerId: pseudonyms.get(s.key) as string,
        isLeader: leaders.has(s.key),
        text: s.text,
        start_time: at,
        end_time:
          at === null || lasted === null
            ? null
            : seconds(at * 1000 + Math.max(0, lasted)),
      };
    });

    return {
      id,
      title: str(meta.title),
      host_email: null,
      organizer_email: null,
      dateString: str(meta.date_string),
      duration: num(meta.duration_min),
      meeting_link: str(meta.meeting_url) || null,
      audio_url: null,
      video_url: `${this.cfg.url}${folder}/recording.mp4`,
      transcript_url: null,
      sentences,
    };
  }
}

/**
 * The archive settings for the shadow: video only from the gateway's host, and
 * the export token on requests to that host alone.
 *
 * The archive pins each request to the address it checked and sends only a
 * Host header, so the token is added below that, after the pinning, and only
 * when the request is for the gateway: a redirect elsewhere never carries it
 * (and the allow-list refuses one anyway).
 */
export function notetakerArchiveDeps(
  cfg: Pick<NotetakerShadowConfig, "host" | "token">,
  delegate: (
    url: string | URL,
    init?: RequestInit,
  ) => Promise<Response> = fetch,
): Pick<ArchiveDeps, "fetch" | "videoHosts"> {
  const withToken = (url: string | URL, init?: RequestInit) =>
    delegate(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        authorization: `Bearer ${cfg.token}`,
      },
    });
  return {
    videoHosts: [cfg.host],
    fetch: (url, init, address) =>
      pinnedFetch(
        url,
        init,
        address,
        new URL(url).hostname.toLowerCase() === cfg.host ? withToken : delegate,
      ),
  };
}
