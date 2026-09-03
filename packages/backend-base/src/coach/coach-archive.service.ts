import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { MAX_STREAMED_OBJECT_BYTES } from "../shared/storage/bun-s3.helper";
import { ObjectStorageService } from "../shared/storage/storage.service";
import type { FirefliesDetailClient } from "./fireflies.client";

/**
 * Retrieving and retaining a session's source material (change:
 * port-coach-pipeline, task 4.4).
 *
 * The provider's share links expire. A report is a judgement about a session,
 * and a judgement whose evidence has evaporated cannot be reviewed, disputed or
 * re-scored, so the recording and the transcript are copied into VerseMate's
 * own storage and addressed by OUR key. After that the provider link expiring
 * changes nothing.
 */

export type RetainFailure =
  | "unknown-session"
  | "no-transcript"
  | "no-video"
  | "untrusted-video-host"
  | "recording-too-large"
  | "retrieval-failed";

/**
 * How long we will wait for the provider to serve the bytes. Without a deadline
 * a hung provider socket holds the sweep open forever, and the sweep is serial.
 */
const RETRIEVAL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Hosts the recording may be fetched from.
 *
 * `video_url` is PROVIDER-SUPPLIED and was fetched verbatim, so a compromised
 * or mis-scoped provider response could point the backend at anything the
 * container can reach, link-local metadata, an internal service, and the
 * response was streamed straight into our bucket. That is server-side request
 * forgery with a write primitive. An allowlist is the cheap correct answer, and
 * anything off it is a retrieval failure, which the retry and re-share path
 * already handles.
 *
 * Override with COACH_VIDEO_HOST_ALLOWLIST so a provider CDN move is a config
 * change rather than a deploy.
 */
function allowedVideoHosts(): string[] {
  const configured = (process.env.COACH_VIDEO_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0
    ? configured
    : ["fireflies.ai", "s3.amazonaws.com"];
}

/** True when the URL is https and its host is on the allowlist. */
export function isAllowedVideoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return allowedVideoHosts().some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

export interface RetainResult {
  retained: boolean;
  reason?: RetainFailure;
  recordingBytes?: number;
}

/** Injected so retention is testable without a bucket or a provider. */
export interface ArchiveDeps {
  storage?: Pick<
    ObjectStorageService,
    "putGlobalObjectStream" | "putGlobalObject" | "deleteObject"
  >;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

export class CoachArchiveService {
  private readonly storage: NonNullable<ArchiveDeps["storage"]>;
  private readonly fetchImpl: NonNullable<ArchiveDeps["fetch"]>;

  constructor(
    private readonly db: db,
    private readonly fireflies: FirefliesDetailClient,
    deps: ArchiveDeps = {},
  ) {
    this.storage = deps.storage ?? new ObjectStorageService();
    this.fetchImpl =
      deps.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  }

  /** Where a session's material lives. Our key, never the provider's URL. */
  static recordingKey(sourceSessionId: string): string {
    return `coach/sessions/${sourceSessionId}/recording.mp4`;
  }

  static transcriptKey(sourceSessionId: string): string {
    return `coach/sessions/${sourceSessionId}/transcript.json`;
  }

  async retain(sourceSessionId: string): Promise<RetainResult> {
    const conn = this.db.getOrCreateConnection();
    const session = await conn
      .selectFrom("coach_intake_sessions")
      .select(["source_session_id", "coach_id"])
      .where("source_session_id", "=", sourceSessionId)
      .executeTakeFirst();
    if (!session) return { retained: false, reason: "unknown-session" };

    const leaderName = session.coach_id
      ? (
          await conn
            .selectFrom("coach_leaders")
            .select("name")
            .where("slug", "=", session.coach_id)
            .executeTakeFirst()
        )?.name ?? null
      : null;

    const detail = await this.fireflies.getTranscript(
      sourceSessionId,
      leaderName,
    );
    if (!detail) return { retained: false, reason: "no-transcript" };

    // No audio-only reports, and no report at all without retained source
    // material: a session scored without video has nothing to judge Visual
    // Aids against, and the report would silently mean something different
    // from every other report.
    if (!detail.video_url) return { retained: false, reason: "no-video" };

    // The provider hands us this URL; it is not ours to trust.
    if (!isAllowedVideoUrl(detail.video_url)) {
      console.error(
        `[COACH-ARCHIVE] refusing ${sourceSessionId}: video host not allowed`,
      );
      return { retained: false, reason: "untrusted-video-host" };
    }

    const response = await this.fetchImpl(detail.video_url, {
      signal: AbortSignal.timeout(RETRIEVAL_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      return { retained: false, reason: "retrieval-failed" };
    }

    // Refuse before spending the upload, when the provider declares the size.
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_STREAMED_OBJECT_BYTES) {
      return { retained: false, reason: "recording-too-large" };
    }

    // Stream, never buffer: a recorded session is far larger than anything
    // this container should hold in memory (task 4.3b).
    const recordingKey = CoachArchiveService.recordingKey(sourceSessionId);
    const recordingBytes = await this.storage.putGlobalObjectStream({
      key: recordingKey,
      body: response.body as ReadableStream<Uint8Array>,
      contentType: "video/mp4",
    });

    // The transcript is stored as OUR pseudonymised form, not the provider's
    // payload: the provider's carries speaker names, and open question 4 says
    // none are stored (task 4.3a).
    const transcriptKey = CoachArchiveService.transcriptKey(sourceSessionId);
    const transcriptBody = JSON.stringify({
      sourceSessionId,
      title: detail.title,
      dateString: detail.dateString,
      duration: detail.duration,
      participantCount: detail.participantCount,
      summary: detail.summary,
      sentences: detail.sentences,
    });
    await this.storage.putGlobalObject({
      key: transcriptKey,
      body: Buffer.from(transcriptBody, "utf8"),
      contentType: "application/json",
    });

    await this.recordAsset({
      coachId: session.coach_id,
      sourceSessionId,
      kind: "recording",
      storageKey: recordingKey,
      byteSize: recordingBytes,
      contentType: "video/mp4",
    });
    await this.recordAsset({
      coachId: session.coach_id,
      sourceSessionId,
      kind: "transcript",
      storageKey: transcriptKey,
      byteSize: Buffer.byteLength(transcriptBody, "utf8"),
      contentType: "application/json",
    });

    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "retained", updated_at: sql`NOW()` })
      .where("source_session_id", "=", sourceSessionId)
      .execute();

    return { retained: true, recordingBytes };
  }

  /**
   * Upsert on (source_session_id, kind), so a re-poll of an already-retained
   * session refreshes the row rather than staging a second copy of the video.
   */
  private async recordAsset(input: {
    coachId: string | null;
    sourceSessionId: string;
    kind: "recording" | "transcript";
    storageKey: string;
    byteSize: number;
    contentType: string;
  }): Promise<void> {
    await sql`
      INSERT INTO coach_session_assets
        (coach_id, source_session_id, kind, storage_key, byte_size, content_type)
      VALUES (
        ${input.coachId ?? ""}, ${input.sourceSessionId}, ${input.kind},
        ${input.storageKey}, ${input.byteSize}, ${input.contentType}
      )
      ON CONFLICT (source_session_id, kind) DO UPDATE SET
        storage_key  = EXCLUDED.storage_key,
        byte_size    = EXCLUDED.byte_size,
        content_type = EXCLUDED.content_type
    `.execute(this.db.getOrCreateConnection());
  }
}
