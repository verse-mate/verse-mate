import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { ObjectStorageService } from "../shared/storage/storage.service";
import { CoachArchiveService } from "./coach-archive.service";
import { VIDEO_FORMATS, mediaInput } from "./coach-media-input";
import type { TimedLine } from "./coach-transcript";
import {
  UPLOAD_MIN_SECONDS,
  type UploadStorage,
  partKeys,
  uploadPartKey,
} from "./coach-upload.service";

export const MEDIA_BATCH_LIMIT = 2;
export const MEDIA_ADDRESS_SECONDS = 60 * 60;
export const UPLOAD_MAX_SECONDS = 4 * 60 * 60;
export const MEDIA_ATTEMPTS = 3;
const CLAIM_LAPSES = sql`interval '2 hours'`;
const ABANDONED_AFTER = sql`interval '24 hours'`;

export interface MediaProbe {
  probe(url: string): Promise<{ hasVideo: boolean; seconds: number }>;
}

export interface Transcriber {
  transcribe(input: {
    recordingUrl: string;
    recordingKey: string;
  }): Promise<TimedLine[]>;
}

export const UPLOAD_FAILURES = {
  incomplete: "the file did not arrive whole",
  unreadable: "the file could not be read as a video",
  noVideo: "the file has no video track, and a report needs video",
  short: "the recording runs under two minutes and may be incomplete",
  long: "the recording runs over four hours, the longest an upload can be",
  transcription: "the recording could not be transcribed",
  abandoned: "the file was not finished uploading within a day",
} as const;

class UploadFailed extends Error {}

export class CoachUploadMediaService {
  private readonly storage: UploadStorage;
  private readonly probe: MediaProbe;
  private readonly transcriber: Transcriber;

  constructor(
    private readonly db: db,
    storage: UploadStorage | undefined,
    deps: { probe: MediaProbe; transcriber: Transcriber },
  ) {
    this.storage = storage ?? new ObjectStorageService();
    this.probe = deps.probe;
    this.transcriber = deps.transcriber;
  }

  async process(limit = MEDIA_BATCH_LIMIT): Promise<
    Array<{
      sourceSessionId: string;
      outcome: "retained" | "failed" | "retry";
      reason?: string;
    }>
  > {
    await this.sweepAbandoned();
    const conn = this.db.getOrCreateConnection();
    const due = await conn
      .selectFrom("coach_intake_sessions as s")
      .innerJoin(
        "coach_uploads as u",
        "u.source_session_id",
        "s.source_session_id",
      )
      .select([
        "s.source_session_id as sourceSessionId",
        "s.coach_id as coachId",
        "s.title as title",
        "u.id as uploadId",
        "u.parts as parts",
        "u.file_bytes as fileBytes",
        "u.content_type as contentType",
      ])
      .where("s.source", "=", "upload")
      .where("s.state", "=", "received")
      .where((eb) =>
        eb.or([
          eb("u.claimed_at", "is", null),
          eb("u.claimed_at", "<", sql<Date>`now() - ${CLAIM_LAPSES}`),
        ]),
      )
      .orderBy("s.observed_at")
      .limit(limit)
      .execute();
    const out: Array<{
      sourceSessionId: string;
      outcome: "retained" | "failed" | "retry";
      reason?: string;
    }> = [];
    for (const upload of due) {
      const uploadId = upload.uploadId as string;
      const claim = await conn
        .updateTable("coach_uploads")
        .set({ claimed_at: sql`now()`, attempts: sql`attempts + 1` })
        .where("id", "=", uploadId as never)
        .where((eb) =>
          eb.or([
            eb("claimed_at", "is", null),
            eb("claimed_at", "<", sql<Date>`now() - ${CLAIM_LAPSES}`),
          ]),
        )
        .returning("attempts")
        .executeTakeFirst();
      if (!claim) continue;
      if (claim.attempts > MEDIA_ATTEMPTS) {
        await this.fail(
          upload.sourceSessionId,
          uploadId,
          upload.parts,
          UPLOAD_FAILURES.transcription,
        );
        out.push({
          sourceSessionId: upload.sourceSessionId,
          outcome: "failed",
          reason: UPLOAD_FAILURES.transcription,
        });
        continue;
      }
      try {
        await this.processOne({ ...upload, uploadId });
        out.push({
          sourceSessionId: upload.sourceSessionId,
          outcome: "retained",
        });
      } catch (error) {
        if (!(error instanceof UploadFailed))
          console.error(
            `[coach-upload] ${upload.sourceSessionId} attempt ${claim.attempts}:`,
            error,
          );
        if (
          !(error instanceof UploadFailed) &&
          claim.attempts < MEDIA_ATTEMPTS
        ) {
          await conn
            .updateTable("coach_uploads")
            .set({ claimed_at: null })
            .where("id", "=", uploadId as never)
            .execute();
          out.push({
            sourceSessionId: upload.sourceSessionId,
            outcome: "retry",
          });
          continue;
        }
        const reason =
          error instanceof UploadFailed
            ? error.message
            : UPLOAD_FAILURES.transcription;
        await this.fail(upload.sourceSessionId, uploadId, upload.parts, reason);
        out.push({
          sourceSessionId: upload.sourceSessionId,
          outcome: "failed",
          reason,
        });
      }
    }
    return out;
  }

  private async sweepAbandoned() {
    const abandoned = await this.db
      .getOrCreateConnection()
      .updateTable("coach_uploads")
      .set({ state: "failed", failure: UPLOAD_FAILURES.abandoned })
      .where("state", "=", "awaiting-file")
      .where("created_at", "<", sql<Date>`now() - ${ABANDONED_AFTER}`)
      .returning(["id", "parts"])
      .execute();
    for (const upload of abandoned)
      for (const key of partKeys(upload.id as string, upload.parts))
        await this.storage.deleteObject(key);
  }

  private async processOne(upload: {
    sourceSessionId: string;
    coachId: string | null;
    title: string;
    uploadId: string;
    parts: number;
    fileBytes: string;
    contentType: string;
  }): Promise<void> {
    const recordingKey = CoachArchiveService.recordingKey(
      upload.sourceSessionId,
    );
    const written = await this.storage.putGlobalObjectStream({
      key: recordingKey,
      body: this.joinedParts(upload.uploadId, upload.parts),
      contentType: upload.contentType,
    });
    if (written !== Number(upload.fileBytes))
      throw new UploadFailed(UPLOAD_FAILURES.incomplete);
    const recordingUrl = await this.storage.getGlobalObjectUrl({
      key: recordingKey,
      expiresInSeconds: MEDIA_ADDRESS_SECONDS,
    });
    const probed = await this.probe.probe(recordingUrl).catch(() => {
      throw new UploadFailed(UPLOAD_FAILURES.unreadable);
    });
    if (!probed.hasVideo) throw new UploadFailed(UPLOAD_FAILURES.noVideo);
    if (probed.seconds < UPLOAD_MIN_SECONDS)
      throw new UploadFailed(UPLOAD_FAILURES.short);
    if (probed.seconds > UPLOAD_MAX_SECONDS)
      throw new UploadFailed(UPLOAD_FAILURES.long);
    const lines = await this.transcriber.transcribe({
      recordingUrl,
      recordingKey,
    });

    const transcriptKey = CoachArchiveService.transcriptKey(
      upload.sourceSessionId,
    );
    const minutes = Math.round(probed.seconds / 60);
    const transcript = JSON.stringify({
      sourceSessionId: upload.sourceSessionId,
      title: upload.title,
      duration: minutes,
      participantCount: null,
      summary: null,
      sentences: lines.map((line, index) => ({
        index,
        speakerId: line.speakerId,
        isLeader: line.isLeader,
        text: line.text,
        start_time: line.startTime ?? null,
        end_time: null,
      })),
    });
    await this.storage.putGlobalObject({
      key: transcriptKey,
      body: Buffer.from(transcript, "utf8"),
      contentType: "application/json",
    });
    const conn = this.db.getOrCreateConnection();
    for (const [kind, key, bytes, type] of [
      ["recording", recordingKey, written, upload.contentType],
      [
        "transcript",
        transcriptKey,
        Buffer.byteLength(transcript, "utf8"),
        "application/json",
      ],
    ] as const)
      await sql`
        INSERT INTO coach_session_assets
          (coach_id, source_session_id, kind, storage_key, byte_size, content_type)
        VALUES (${upload.coachId ?? ""}, ${upload.sourceSessionId}, ${kind}, ${key}, ${bytes}, ${type})
        ON CONFLICT (source_session_id, kind) DO UPDATE SET
          storage_key = EXCLUDED.storage_key,
          byte_size = EXCLUDED.byte_size,
          content_type = EXCLUDED.content_type
      `.execute(conn);
    const kept = await conn
      .updateTable("coach_intake_sessions")
      .set({
        state: "retained",
        duration_minutes: minutes,
        updated_at: sql`now()`,
      })
      .where("source_session_id", "=", upload.sourceSessionId)
      .where("state", "=", "received")
      .executeTakeFirst();
    if (Number(kept.numUpdatedRows ?? 0) === 0) {
      const session = await conn
        .selectFrom("coach_intake_sessions")
        .select("state")
        .where("source_session_id", "=", upload.sourceSessionId)
        .executeTakeFirst();
      if (!session) {
        await conn
          .deleteFrom("coach_session_assets")
          .where("source_session_id", "=", upload.sourceSessionId)
          .execute();
        await this.storage.deleteObject(recordingKey);
        await this.storage.deleteObject(transcriptKey);
      }
      return;
    }
    for (let part = 1; part <= upload.parts; part += 1)
      await this.storage.deleteObject(uploadPartKey(upload.uploadId, part));
  }

  private joinedParts(
    uploadId: string,
    parts: number,
  ): ReadableStream<Uint8Array> {
    const storage = this.storage;
    let part = 0;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (true) {
          if (!reader) {
            part += 1;
            if (part > parts) {
              controller.close();
              return;
            }
            const stream = await storage.getGlobalObjectStream(
              uploadPartKey(uploadId, part),
            );
            if (!stream) {
              controller.error(new UploadFailed(UPLOAD_FAILURES.incomplete));
              return;
            }
            reader = stream.getReader();
          }
          const { done, value } = await reader.read();
          if (done) {
            reader = null;
            continue;
          }
          controller.enqueue(value);
          return;
        }
      },
    });
  }

  private async fail(
    sourceSessionId: string,
    uploadId: string,
    parts: number,
    reason: string,
  ) {
    const conn = this.db.getOrCreateConnection();
    const failed = await conn.transaction().execute(async (trx) => {
      const session = await trx
        .updateTable("coach_intake_sessions")
        .set({
          state: "upload_failed",
          hold_reason: reason,
          updated_at: sql`now()`,
        })
        .where("source_session_id", "=", sourceSessionId)
        .where("state", "=", "received")
        .executeTakeFirst();
      if (Number(session.numUpdatedRows ?? 0) === 0) return false;
      await trx
        .updateTable("coach_uploads")
        .set({ state: "failed", failure: reason })
        .where("id", "=", uploadId as never)
        .where("state", "=", "received")
        .execute();
      await trx
        .updateTable("coach_intake_sessions")
        .set({ state: "retained", duplicate_of: null, updated_at: sql`now()` })
        .where("duplicate_of", "=", sourceSessionId)
        .where("state", "=", "duplicate")
        .where("duplicate_dismissed_at", "is", null)
        .execute();
      return true;
    });
    if (!failed) return;
    for (const key of [
      ...partKeys(uploadId, parts),
      CoachArchiveService.recordingKey(sourceSessionId),
      CoachArchiveService.transcriptKey(sourceSessionId),
    ])
      await this.storage.deleteObject(key);
  }
}

export function readProbe(output: string): {
  hasVideo: boolean;
  seconds: number;
} {
  const parsed = JSON.parse(output) as {
    streams?: Array<{ codec_type?: string }>;
    format?: { duration?: string };
  };
  const seconds = Number(parsed.format?.duration ?? Number.NaN);
  if (!Number.isFinite(seconds)) throw new Error("no duration");
  return {
    hasVideo: (parsed.streams ?? []).some((s) => s.codec_type === "video"),
    seconds,
  };
}

export function ffprobeWith(formats = VIDEO_FORMATS): MediaProbe {
  return {
    async probe(url) {
      const proc = Bun.spawn(
        [
          "ffprobe",
          "-v",
          "error",
          ...mediaInput(formats),
          "-show_entries",
          "stream=codec_type:format=duration",
          "-of",
          "json",
          url,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [out, code] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
      ]);
      if (code !== 0) throw new Error(`ffprobe exited ${code}`);
      return readProbe(out);
    },
  };
}

export const ffprobe: MediaProbe = ffprobeWith();
