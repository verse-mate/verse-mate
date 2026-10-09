import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { ObjectStorageService } from "../shared/storage/storage.service";
import { botClassKey, markLikelyDuplicate } from "./coach-upload.service";
import type { FirefliesDetailClient } from "./fireflies.client";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";

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
  | "recording-truncated"
  | "retrieval-failed";

/**
 * How long we will wait for the provider to serve the bytes. Without a deadline
 * a hung provider socket holds the sweep open forever, and the sweep is serial.
 */
const RETRIEVAL_TIMEOUT_MS = 10 * 60 * 1000;

export const MAX_VIDEO_REDIRECTS = 3;

export const MAX_RECORDING_BYTES = 8 * 1024 ** 3;

const NON_PUBLIC = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  NON_PUBLIC.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !NON_PUBLIC.check(address, family === 4 ? "ipv4" : "ipv6");
}

async function systemResolve(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true })).map((a) => a.address);
}

function declaredLength(headers: Headers): number | null {
  const raw = headers.get("content-length")?.trim() ?? "";
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

class RecordingTooLarge extends Error {}

export class Mp4BoxWalk {
  private seen = 0;
  private boxEnd = 0;
  private header: number[] = [];
  private broken = false;
  private readonly types = new Set<string>();

  feed(chunk: Uint8Array): void {
    let i = 0;
    while (i < chunk.length && !this.broken) {
      if (this.seen < this.boxEnd) {
        const skip = Math.min(chunk.length - i, this.boxEnd - this.seen);
        i += skip;
        this.seen += skip;
        continue;
      }
      this.header.push(chunk[i]);
      i += 1;
      this.seen += 1;
      this.readHeader();
    }
  }

  private readHeader(): void {
    if (this.header.length < 8) return;
    const head = Uint8Array.from(this.header);
    const view = new DataView(head.buffer);
    const short = view.getUint32(0);
    if (short === 1 && this.header.length < 16) return;
    const size =
      short === 1 ? view.getUint32(8) * 2 ** 32 + view.getUint32(12) : short;
    if (size < this.header.length) {
      this.broken = true;
      return;
    }
    this.types.add(String.fromCharCode(...head.subarray(4, 8)));
    this.boxEnd = this.seen - this.header.length + size;
    this.header = [];
  }

  complete(): boolean {
    return !this.broken && this.seen === this.boxEnd && this.types.has("moov");
  }
}

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
  return configured.length > 0 ? configured : ["fireflies.ai"];
}

/** True when the URL is https and its host is on the allowlist. */
export function isAllowedVideoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  return allowedVideoHosts().some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

type Fetch = (url: string | URL, init?: RequestInit) => Promise<Response>;

export function pinnedFetch(
  url: string,
  init: RequestInit,
  address: string,
  delegate: Fetch = fetch,
): Promise<Response> {
  const target = new URL(url);
  const name = target.hostname;
  target.hostname = isIP(address) === 6 ? `[${address}]` : address;
  return delegate(target.toString(), {
    ...init,
    headers: { host: name },
    tls: { serverName: name },
  } as RequestInit);
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
  fetch?: (
    url: string,
    init: RequestInit,
    address: string,
  ) => Promise<Response>;
  resolve?: (hostname: string) => Promise<string[]>;
  maxRecordingBytes?: number;
}

export class CoachArchiveService {
  private readonly storage: NonNullable<ArchiveDeps["storage"]>;
  private readonly fetchImpl: NonNullable<ArchiveDeps["fetch"]>;
  private readonly resolve: NonNullable<ArchiveDeps["resolve"]>;
  private readonly maxRecordingBytes: number;

  constructor(
    private readonly db: db,
    private readonly fireflies: FirefliesDetailClient,
    deps: ArchiveDeps = {},
  ) {
    this.storage = deps.storage ?? new ObjectStorageService();
    this.fetchImpl = deps.fetch ?? pinnedFetch;
    this.resolve = deps.resolve ?? systemResolve;
    this.maxRecordingBytes = deps.maxRecordingBytes ?? MAX_RECORDING_BYTES;
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
      .select(["source_session_id", "coach_id", "rotating_class_id"])
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

    const fetched = await this.fetchFollowingAllowedRedirects(detail.video_url);
    if (!(fetched instanceof Response)) {
      return { retained: false, reason: fetched };
    }
    const response = fetched;
    if (!response.ok || !response.body) {
      return { retained: false, reason: "retrieval-failed" };
    }

    const declared = declaredLength(response.headers);
    if (declared !== null && declared > this.maxRecordingBytes) {
      await response.body.cancel();
      return { retained: false, reason: "recording-too-large" };
    }

    const limit = this.maxRecordingBytes;
    let streamed = 0;
    const boxes = new Mp4BoxWalk();
    const bounded = (response.body as ReadableStream<Uint8Array>).pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          streamed += chunk.byteLength;
          if (streamed > limit) controller.error(new RecordingTooLarge());
          else {
            if (declared === null) boxes.feed(chunk);
            controller.enqueue(chunk);
          }
        },
      }),
    );

    const recordingKey = CoachArchiveService.recordingKey(sourceSessionId);
    let recordingBytes: number;
    try {
      recordingBytes = await this.storage.putGlobalObjectStream({
        key: recordingKey,
        body: bounded,
        contentType: "video/mp4",
      });
    } catch (error) {
      await this.storage.deleteObject(recordingKey).catch(() => false);
      if (streamed > limit) {
        return { retained: false, reason: "recording-too-large" };
      }
      throw error;
    }
    if (
      recordingBytes === 0 ||
      (declared === null ? !boxes.complete() : recordingBytes !== declared)
    ) {
      await this.storage.deleteObject(recordingKey).catch(() => false);
      return { retained: false, reason: "recording-truncated" };
    }

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

    const writer = conn as CoachReportsWriter;
    await conn
      .updateTable("coach_intake_sessions")
      .set({
        state: "retained",
        retry_count: 0,
        meeting_link: detail.meeting_link ?? null,
        class_key: await botClassKey(writer, {
          coachId: session.coach_id,
          rotatingClassId: session.rotating_class_id,
          meetingLink: detail.meeting_link ?? null,
        }),
        updated_at: sql`NOW()`,
      })
      .where("source_session_id", "=", sourceSessionId)
      .execute();
    await markLikelyDuplicate(writer, sourceSessionId);

    return { retained: true, recordingBytes };
  }

  private async fetchFollowingAllowedRedirects(
    first: string,
  ): Promise<Response | RetainFailure> {
    const signal = AbortSignal.timeout(RETRIEVAL_TIMEOUT_MS);
    let url = first;
    for (let hop = 0; hop <= MAX_VIDEO_REDIRECTS; hop += 1) {
      const address = await this.publicAddress(url);
      if (!isIP(address)) return address as RetainFailure;
      const response = await this.fetchImpl(
        url,
        { signal, redirect: "manual" },
        address,
      );
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) {
        return response;
      }
      await response.body?.cancel();
      url = new URL(location, url).toString();
      if (!isAllowedVideoUrl(url)) {
        console.error("[COACH-ARCHIVE] refusing a redirect off the allowlist");
        return "untrusted-video-host";
      }
    }
    return "retrieval-failed";
  }

  private async publicAddress(url: string): Promise<string | RetainFailure> {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    let addresses: string[];
    try {
      addresses = isIP(host) ? [host] : await this.resolve(host);
    } catch {
      return "retrieval-failed";
    }
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      console.error(
        "[COACH-ARCHIVE] refusing a video host that resolves to a non-public address",
      );
      return "untrusted-video-host";
    }
    return addresses[0];
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
