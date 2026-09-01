import { firefliesApiKey } from "./fireflies.config";

/**
 * The Fireflies GraphQL client (change: port-coach-pipeline, task 4.1).
 *
 * Ported from the host's `fireflies_client.py`, keeping its query shapes: the
 * watermark scan asks for the lean transcript list, and the heavy per-session
 * fields are fetched only for a session intake has decided to keep.
 *
 * `mine: false` asks for TEAM-WIDE results. That is the whole point: the bot
 * records every leader's meeting under one shared host address, so a per-user
 * query would see nothing. It is also why the key must be an admin key
 * (see fireflies.config.ts — recorded as an accepted risk).
 *
 * The interface is separate from the HTTP implementation so intake can be
 * driven by a recorded fixture. That is not only for tests: VerseMate does not
 * yet hold the credential, so everything downstream of this boundary is built
 * and verified before the key is placed.
 */

const ENDPOINT = "https://api.fireflies.ai/graphql";

/** A transcript as the lean watermark scan returns it. */
export interface FirefliesTranscript {
  id: string;
  title: string;
  host_email: string | null;
  organizer_email: string | null;
  /** ISO 8601. The host's `dateString`. */
  dateString: string;
  /** Minutes. */
  duration: number | null;
}

/** The heavy per-session fetch, for a session intake has decided to keep. */
export interface FirefliesTranscriptDetail extends FirefliesTranscript {
  audio_url: string | null;
  video_url: string | null;
  transcript_url: string | null;
  /** Participant COUNT only — see below. */
  participantCount: number;
  summary: { overview?: string } | null;
  /**
   * PSEUDONYMOUS. Speakers are numbered, never named.
   *
   * Dimensions 4 (Facilitation vs. Lecture) and 6 (Participant Engagement) both
   * need to tell the leader apart from the room, which the provider only
   * expresses by name. So the name is used ONCE, inside this client, to decide
   * which speaker is the leader — and then dropped. Nothing downstream ever
   * receives it, which is what makes open question 4's answer hold for the
   * retained transcript and not only for the report surfaces.
   */
  sentences: Array<{
    index: number;
    speakerId: string;
    isLeader: boolean;
    text: string;
    start_time: number | null;
    end_time: number | null;
  }>;
}

export interface FirefliesClient {
  listTranscripts(opts: {
    since: Date | null;
    limit: number;
  }): Promise<FirefliesTranscript[]>;
}

export interface FirefliesDetailClient extends FirefliesClient {
  /**
   * @param leaderName the attributed leader's roster name, used only to mark
   *        which speaker is the leader. It is never stored.
   */
  getTranscript(
    id: string,
    leaderName: string | null,
  ): Promise<FirefliesTranscriptDetail | null>;
}

const Q_TRANSCRIPTS = `
query Transcripts($fromDate: DateTime, $limit: Int) {
  transcripts(fromDate: $fromDate, limit: $limit, mine: false) {
    id
    title
    host_email
    organizer_email
    dateString
    duration
  }
}
`;

// Deliberately WITHOUT `participants` and `meeting_attendees { displayName
// email }`, which the host's query asked for. Open question 4 is answered: no
// participant name is stored, and the cheapest way to keep that true is to
// never receive them. Only a count is derived, from the speaker list.
const Q_TRANSCRIPT = `
query Transcript($id: String!) {
  transcript(id: $id) {
    id
    title
    host_email
    organizer_email
    dateString
    duration
    audio_url
    video_url
    transcript_url
    speakers { id }
    summary { overview }
    sentences { index speaker_name text start_time end_time }
  }
}
`;

export class FirefliesError extends Error {}

async function query<T>(
  document: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${firefliesApiKey()}`,
    },
    body: JSON.stringify({ query: document, variables }),
  });
  if (!response.ok) {
    throw new FirefliesError(
      `Fireflies responded ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  if (body.errors?.length) {
    throw new FirefliesError(
      body.errors.map((e) => e.message ?? JSON.stringify(e)).join("; "),
    );
  }
  if (!body.data) throw new FirefliesError("Fireflies returned no data");
  return body.data;
}

export class HttpFirefliesClient implements FirefliesDetailClient {
  async listTranscripts(opts: {
    since: Date | null;
    limit: number;
  }): Promise<FirefliesTranscript[]> {
    const data = await query<{ transcripts: FirefliesTranscript[] | null }>(
      Q_TRANSCRIPTS,
      {
        fromDate: opts.since ? opts.since.toISOString() : null,
        limit: opts.limit,
      },
    );
    return data.transcripts ?? [];
  }

  async getTranscript(
    id: string,
    leaderName: string | null,
  ): Promise<FirefliesTranscriptDetail | null> {
    const data = await query<{
      transcript:
        | (Omit<FirefliesTranscriptDetail, "participantCount" | "sentences"> & {
            speakers?: Array<{ id: string }> | null;
            sentences?: Array<{
              index: number;
              speaker_name: string | null;
              text: string;
              start_time: number | null;
              end_time: number | null;
            }> | null;
          })
        | null;
    }>(Q_TRANSCRIPT, { id });
    const t = data.transcript;
    if (!t) return null;
    const { speakers, sentences, ...rest } = t;

    // Names are resolved to pseudonyms HERE and go no further. A stable number
    // per distinct name keeps the two speaker-aware dimensions computable while
    // nothing downstream — the retained transcript included — holds a name.
    const pseudonyms = new Map<string, string>();
    const leader = (leaderName ?? "").trim().toLowerCase();
    const pseudonymised = (sentences ?? []).map((s) => {
      const name = (s.speaker_name ?? "").trim();
      const key = name.toLowerCase();
      if (!pseudonyms.has(key)) {
        pseudonyms.set(key, `speaker-${pseudonyms.size + 1}`);
      }
      return {
        index: s.index,
        speakerId: pseudonyms.get(key) as string,
        // Substring both ways: the provider labels a speaker "Bryan" where the
        // roster says "Bryan Bailey", and sometimes the reverse.
        isLeader:
          leader.length > 0 &&
          key.length > 0 &&
          (key.includes(leader) || leader.includes(key)),
        text: s.text,
        start_time: s.start_time,
        end_time: s.end_time,
      };
    });

    return {
      ...rest,
      sentences: pseudonymised,
      // A count, never names (open question 4). Derived from the speaker list
      // because that is the only participant signal the query still asks for.
      participantCount: (speakers ?? []).length,
    };
  }
}
