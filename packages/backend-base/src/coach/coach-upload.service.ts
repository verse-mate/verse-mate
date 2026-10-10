import { sql } from "kysely";

import type { db } from "../shared/shared.plugin";
import { ObjectStorageService } from "../shared/storage/storage.service";
import { coachPipelineLive } from "./coach-cutover";
import { calendarDate } from "./coach-reminder.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";

export const UPLOAD_MAX_BYTES = 8 * 1024 ** 3;
export const UPLOAD_PART_BYTES = 64 * 1024 ** 2;
export const UPLOAD_ADDRESS_SECONDS = 3 * 60 * 60;
export const UPLOAD_MAX_DAYS_BACK = 60;
export const UPLOAD_MIN_SECONDS = 120;
export const UPLOAD_TITLE_CHARS = 80;
export const UPLOAD_FORMATS: Record<string, string[]> = {
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  webm: ["video/webm"],
  mkv: ["video/x-matroska", "video/matroska"],
};

const USABLE_BOT_STATES = [
  "retained",
  "scored",
  "delivered",
  "delivery_pending",
  "delivering",
  "delivery_failed",
  "scoring_failed",
];

export type UploadStorage = Pick<
  ObjectStorageService,
  | "getGlobalObjectUploadUrl"
  | "objectSize"
  | "getGlobalObjectStream"
  | "putGlobalObjectStream"
  | "putGlobalObject"
  | "getGlobalObjectText"
  | "getGlobalObjectUrl"
  | "deleteObject"
>;

export interface UploadClass {
  key: string;
  name: string;
  kind: "registered" | "rotating" | "group";
}

export type UploadRefusal =
  | "unknown-leader"
  | "invalid-date"
  | "parallel-run"
  | "not-your-class"
  | "too-large"
  | "not-video"
  | "date-in-future"
  | "date-too-old"
  | "upload-exists"
  | "already-recorded"
  | "not-replaceable";

export type UploadStatus =
  | "uploading"
  | "processing"
  | "held"
  | "waiting-for-admin"
  | "attributed-elsewhere"
  | "ready"
  | "failed";

export interface UploadView {
  id: string;
  coachId: string;
  classKey: string;
  className: string;
  sessionDate: string;
  title: string | null;
  status: UploadStatus;
  reason: string | null;
  reportId: string | null;
  createdAt: string;
}

export interface UploadParts {
  uploadId: string;
  partBytes: number;
  parts: Array<{ partNumber: number; url: string }>;
  expiresAt: string;
}

export const DISMISSED_DUPLICATE =
  "an admin found it repeats a session that was already recorded";

export function uploadSessionId(uploadId: string): string {
  return `upload:${uploadId}`;
}

export function uploadPartKey(uploadId: string, partNumber: number): string {
  return `coach/uploads/${uploadId}/part-${String(partNumber).padStart(5, "0")}`;
}

export function uploadFormat(fileName: string, contentType: string) {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const types = UPLOAD_FORMATS[extension];
  return types?.includes(contentType.toLowerCase()) ? extension : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export class CoachUploadService {
  private readonly storage: UploadStorage;

  constructor(
    private readonly db: db,
    storage?: UploadStorage,
  ) {
    this.storage = storage ?? new ObjectStorageService();
  }

  async classesFor(coachId: string): Promise<UploadClass[] | null> {
    const conn = this.db.getOrCreateConnection();
    const leader = await conn
      .selectFrom("coach_leaders")
      .select(["slug", "name", "email", "group_name", "user_id"])
      .where("slug", "=", coachId)
      .executeTakeFirst();
    if (!leader) return null;
    const registered = await leaderClasses(conn, leader)
      .select(["coach_classes.id as id", "coach_classes.name as name"])
      .orderBy("coach_classes.name")
      .execute();
    const rotating = await conn
      .selectFrom("coach_rotating_classes")
      .innerJoin(
        "coach_rotating_class_leaders",
        "coach_rotating_class_leaders.class_id",
        "coach_rotating_classes.id",
      )
      .select([
        "coach_rotating_classes.id as id",
        "coach_rotating_classes.name as name",
      ])
      .where("coach_rotating_class_leaders.leader_slug", "=", coachId)
      .orderBy("coach_rotating_classes.name")
      .execute();
    const classes: UploadClass[] = [
      ...registered.map((c) => ({
        key: `class:${c.id}`,
        name: c.name,
        kind: "registered" as const,
      })),
      ...rotating.map((c) => ({
        key: `rotating:${c.id}`,
        name: c.name,
        kind: "rotating" as const,
      })),
    ];
    return classes.length > 0
      ? classes
      : [
          {
            key: `group:${coachId}`,
            name: leader.group_name || `${leader.name}'s group`,
            kind: "group",
          },
        ];
  }

  async request(input: {
    coachId: string;
    classKey: string;
    sessionDate: string;
    title?: string | null;
    fileName: string;
    fileBytes: number;
    contentType: string;
    byUserId: string | null;
    byAdmin: boolean;
    replace?: boolean;
    today?: string;
  }): Promise<
    ({ ok: true } & UploadParts) | { ok: false; refusal: UploadRefusal }
  > {
    if (!input.byAdmin && !coachPipelineLive())
      return { ok: false, refusal: "parallel-run" };
    const classes = await this.classesFor(input.coachId);
    if (!classes) return { ok: false, refusal: "unknown-leader" };
    const chosen = classes.find((c) => c.key === input.classKey);
    if (!chosen) return { ok: false, refusal: "not-your-class" };
    if (input.fileBytes > UPLOAD_MAX_BYTES || input.fileBytes <= 0)
      return { ok: false, refusal: "too-large" };
    if (!uploadFormat(input.fileName, input.contentType))
      return { ok: false, refusal: "not-video" };
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate) ||
      Number.isNaN(Date.parse(`${input.sessionDate}T00:00:00Z`))
    )
      return { ok: false, refusal: "invalid-date" };
    const today = input.today ?? calendarDate(new Date());
    const age = daysBetween(input.sessionDate, today);
    if (age < 0) return { ok: false, refusal: "date-in-future" };
    if (age > UPLOAD_MAX_DAYS_BACK)
      return { ok: false, refusal: "date-too-old" };

    const conn = this.db.getOrCreateConnection();
    if (await botRecorded(conn, chosen.key, input.sessionDate))
      return { ok: false, refusal: "already-recorded" };

    const parts = Math.ceil(input.fileBytes / UPLOAD_PART_BYTES);
    const title = uploadTitle(input.title);
    const garbage: string[] = [];
    const created = await conn
      .transaction()
      .execute(async (trx) => {
        const existing = await trx
          .selectFrom("coach_uploads")
          .select(["id", "source_session_id", "state", "uploaded_by"])
          .select(
            sql<boolean>`addresses_at < now() - make_interval(secs => ${UPLOAD_ADDRESS_SECONDS})`.as(
              "expired",
            ),
          )
          .where("class_key", "=", chosen.key)
          .where("session_date", "=", sql<Date>`${input.sessionDate}::date`)
          .where("state", "in", ["awaiting-file", "received"])
          .forUpdate()
          .executeTakeFirst();
        if (existing) {
          const abandoned =
            existing.state === "awaiting-file" &&
            ((existing.uploaded_by !== null &&
              existing.uploaded_by === input.byUserId) ||
              existing.expired);
          if (!abandoned && !(input.byAdmin && input.replace))
            return { refusal: "upload-exists" as const };
          if (
            !(await discardUpload(
              trx as CoachReportsWriter,
              existing.id,
              garbage,
            ))
          )
            return { refusal: "not-replaceable" as const };
        }
        const row = await trx
          .insertInto("coach_uploads")
          .values({
            coach_id: input.coachId,
            class_key: chosen.key,
            class_name: chosen.name,
            session_date: input.sessionDate,
            title,
            file_name: input.fileName,
            file_bytes: input.fileBytes,
            content_type: input.contentType.toLowerCase(),
            parts,
            uploaded_by: input.byUserId as never,
            by_admin: input.byAdmin,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        return { id: row.id as string };
      })
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === "23505")
          return { refusal: "upload-exists" as const };
        throw error;
      });
    if (!("id" in created) || !created.id)
      return { ok: false, refusal: created.refusal ?? "upload-exists" };
    await this.collect(garbage);
    return { ok: true, ...(await this.partAddresses(created.id, parts)) };
  }

  private async partAddresses(
    uploadId: string,
    parts: number,
  ): Promise<UploadParts> {
    return {
      uploadId,
      partBytes: UPLOAD_PART_BYTES,
      parts: await Promise.all(
        Array.from({ length: parts }, async (_, i) => ({
          partNumber: i + 1,
          url: await this.storage.getGlobalObjectUploadUrl({
            key: uploadPartKey(uploadId, i + 1),
            expiresInSeconds: UPLOAD_ADDRESS_SECONDS,
          }),
        })),
      ),
      expiresAt: new Date(
        Date.now() + UPLOAD_ADDRESS_SECONDS * 1000,
      ).toISOString(),
    };
  }

  private async owned(uploadId: string, coachId: string | null) {
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return undefined;
    return this.db
      .getOrCreateConnection()
      .selectFrom("coach_uploads")
      .selectAll()
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("id", "=", uploadId as never)
      .$if(coachId !== null, (q) => q.where("coach_id", "=", coachId as string))
      .executeTakeFirst();
  }

  async refreshParts(
    uploadId: string,
    coachId: string | null,
  ): Promise<UploadParts | null> {
    const upload = await this.owned(uploadId, coachId);
    if (!upload || upload.state !== "awaiting-file") return null;
    await this.db
      .getOrCreateConnection()
      .updateTable("coach_uploads")
      .set({ addresses_at: sql`now()` })
      .where("id", "=", upload.id)
      .execute();
    return this.partAddresses(uploadId, upload.parts);
  }

  async complete(
    uploadId: string,
    coachId: string | null,
  ): Promise<
    | { ok: true; status: UploadStatus }
    | {
        ok: false;
        refusal:
          | "unknown-upload"
          | "file-incomplete"
          | "not-awaiting-file"
          | "already-recorded";
      }
  > {
    const upload = await this.owned(uploadId, coachId);
    if (!upload) return { ok: false, refusal: "unknown-upload" };
    if (upload.state !== "awaiting-file")
      return { ok: false, refusal: "not-awaiting-file" };
    const total = Number(upload.file_bytes);
    for (let part = 1; part <= upload.parts; part += 1) {
      const expected =
        part < upload.parts
          ? UPLOAD_PART_BYTES
          : total - UPLOAD_PART_BYTES * (upload.parts - 1);
      if (
        (await this.storage.objectSize(uploadPartKey(uploadId, part))) !==
        expected
      )
        return { ok: false, refusal: "file-incomplete" };
    }

    const date = upload.date;
    const conn = this.db.getOrCreateConnection();
    if (await botRecorded(conn, upload.class_key, date)) {
      const failed = await conn
        .updateTable("coach_uploads")
        .set({ state: "failed", failure: ALREADY_RECORDED })
        .where("id", "=", upload.id)
        .where("state", "=", "awaiting-file")
        .executeTakeFirst();
      if (Number(failed.numUpdatedRows ?? 0) === 0)
        return { ok: false, refusal: "not-awaiting-file" };
      await this.collect(partKeys(uploadId, upload.parts));
      return { ok: false, refusal: "already-recorded" };
    }
    const rotating = upload.class_key.startsWith("rotating:")
      ? Number(upload.class_key.slice("rotating:".length))
      : null;
    const host = coachPipelineLive()
      ? await conn
          .selectFrom("coach_reports")
          .select("id")
          .where("coach_id", "=", upload.coach_id)
          .where("session_date", "=", sql<Date>`${date}::date`)
          .where("source_session_id", "like", "legacy:%")
          .executeTakeFirst()
      : undefined;
    const sourceSessionId = uploadSessionId(uploadId);
    const received = await conn.transaction().execute(async (trx) => {
      const claimed = await trx
        .updateTable("coach_uploads")
        .set({
          state: "received",
          received_at: sql`now()`,
          source_session_id: sourceSessionId,
        })
        .where("id", "=", upload.id)
        .where("state", "=", "awaiting-file")
        .executeTakeFirst();
      if (Number(claimed.numUpdatedRows ?? 0) === 0) return false;
      await trx
        .insertInto("coach_intake_sessions")
        .values({
          source_session_id: sourceSessionId,
          source: "upload",
          coach_id: rotating === null ? upload.coach_id : null,
          rotating_class_id: rotating,
          matched_by: rotating === null ? "upload" : "rotating_class",
          title: upload.title ?? `${upload.class_name} — ${date}`,
          session_date: date,
          state: host ? "duplicate" : "received",
          duplicate_of: host?.id ?? null,
          parallel_run: !coachPipelineLive(),
          class_key: upload.class_key,
        })
        .execute();
      return true;
    });
    if (!received) return { ok: false, refusal: "not-awaiting-file" };
    const raced = await conn
      .selectFrom("coach_intake_sessions")
      .select("source_session_id")
      .where("source", "=", "bot")
      .where("class_key", "=", upload.class_key)
      .where("session_date", "=", sql<Date>`${date}::date`)
      .where("state", "=", "retained")
      .execute();
    for (const bot of raced)
      await markLikelyDuplicate(
        conn as CoachReportsWriter,
        bot.source_session_id,
      );
    return { ok: true, status: host ? "held" : "processing" };
  }

  private async collect(keys: string[]) {
    for (const key of keys) await this.storage.deleteObject(key);
  }

  async list(coachId: string | null): Promise<UploadView[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_uploads as u")
      .leftJoin(
        "coach_intake_sessions as s",
        "s.source_session_id",
        "u.source_session_id",
      )
      .select([
        "u.id as id",
        "u.coach_id as coachId",
        "u.class_key as classKey",
        "u.class_name as className",
        "u.title as title",
        "u.state as uploadState",
        "u.failure as failure",
        "u.created_at as createdAt",
        "s.state as sessionState",
        "s.coach_id as sessionCoach",
        "s.leader_cue as leaderCue",
        "s.hold_kind as holdKind",
        "s.release_required as releaseRequired",
        "s.parallel_run as parallelRun",
        "s.report_id as reportId",
        "s.duplicate_dismissed_at as dismissedAt",
      ])
      .select(sql<string>`to_char(u.session_date, 'YYYY-MM-DD')`.as("date"))
      .where("u.state", "!=", "discarded")
      .$if(coachId !== null, (q) =>
        q.where("u.coach_id", "=", coachId as string),
      )
      .orderBy("u.created_at", "desc")
      .limit(200)
      .execute();
    return rows.map((r) => {
      const [status, reason] = uploadStatus(r);
      return {
        id: r.id as string,
        coachId: r.coachId,
        classKey: r.classKey,
        className: r.className,
        sessionDate: r.date,
        title: r.title,
        status,
        reason,
        reportId: status === "ready" ? r.reportId : null,
        createdAt: new Date(r.createdAt).toISOString(),
      };
    });
  }

  async likelyDuplicates() {
    return this.db
      .getOrCreateConnection()
      .selectFrom("coach_intake_sessions as s")
      .leftJoin(
        "coach_intake_sessions as other",
        "other.source_session_id",
        "s.duplicate_of",
      )
      .select([
        "s.source_session_id as sourceSessionId",
        "s.source as source",
        "s.coach_id as coachId",
        "s.class_key as classKey",
        "s.title as title",
        "s.duplicate_of as duplicateOf",
        "other.state as otherState",
      ])
      .select(sql<string>`to_char(s.session_date, 'YYYY-MM-DD')`.as("date"))
      .where("s.state", "=", "duplicate")
      .where("s.duplicate_dismissed_at", "is", null)
      .orderBy("s.session_date", "desc")
      .limit(200)
      .execute()
      .then((rows) =>
        rows.map((r) => ({
          sourceSessionId: r.sourceSessionId,
          source: r.source as "bot" | "upload",
          coachId: r.coachId,
          classKey: r.classKey,
          title: r.title,
          sessionDate: r.date,
          duplicateOf: r.duplicateOf,
          against:
            r.source === "upload"
              ? ("host-report" as const)
              : ("upload" as const),
          canScoreInstead:
            r.source === "bot" &&
            r.otherState !== null &&
            r.otherState !== "delivered",
        })),
      );
  }

  async dismissDuplicate(sourceSessionId: string): Promise<boolean> {
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const dismissed = await trx
          .updateTable("coach_intake_sessions")
          .set({ duplicate_dismissed_at: sql`now()`, updated_at: sql`now()` })
          .where("source_session_id", "=", sourceSessionId)
          .where("state", "=", "duplicate")
          .where("duplicate_dismissed_at", "is", null)
          .executeTakeFirst();
        if (Number(dismissed.numUpdatedRows ?? 0) === 0) return false;
        await trx
          .updateTable("coach_uploads")
          .set({ state: "failed", failure: DISMISSED_DUPLICATE })
          .where("source_session_id", "=", sourceSessionId)
          .execute();
        return true;
      });
  }

  async scoreInstead(
    sourceSessionId: string,
  ): Promise<
    | { ok: true }
    | { ok: false; refusal: "not-a-duplicate" | "already-delivered" }
  > {
    const garbage: string[] = [];
    const result = await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        const bot = await trx
          .selectFrom("coach_intake_sessions")
          .select(["duplicate_of"])
          .where("source_session_id", "=", sourceSessionId)
          .where("source", "=", "bot")
          .where("state", "=", "duplicate")
          .where("duplicate_dismissed_at", "is", null)
          .forUpdate()
          .executeTakeFirst();
        if (!bot?.duplicate_of)
          return { ok: false as const, refusal: "not-a-duplicate" as const };
        const upload = await trx
          .selectFrom("coach_uploads")
          .select("id")
          .where("source_session_id", "=", bot.duplicate_of)
          .executeTakeFirst();
        if (
          !upload ||
          !(await discardUpload(
            trx as CoachReportsWriter,
            upload.id as string,
            garbage,
          ))
        )
          return { ok: false as const, refusal: "already-delivered" as const };
        await trx
          .updateTable("coach_intake_sessions")
          .set({
            state: "retained",
            duplicate_of: null,
            updated_at: sql`now()`,
          })
          .where("source_session_id", "=", sourceSessionId)
          .execute();
        return { ok: true as const };
      });
    await this.collect(garbage);
    return result;
  }
}

function uploadStatus(r: {
  uploadState: string;
  failure: string | null;
  sessionState: string | null;
  sessionCoach: string | null;
  coachId: string;
  leaderCue: string | null;
  holdKind: string | null;
  releaseRequired: boolean | null;
  parallelRun: boolean | null;
  dismissedAt: Date | null;
}): [UploadStatus, string | null] {
  if (r.uploadState === "awaiting-file") return ["uploading", null];
  if (r.uploadState === "failed") return ["failed", r.failure];
  if (r.sessionState === "duplicate")
    return r.dismissedAt ? ["failed", DISMISSED_DUPLICATE] : ["held", null];
  if (r.sessionCoach === null && r.leaderCue === "none")
    return ["waiting-for-admin", null];
  if (r.sessionCoach !== null && r.sessionCoach !== r.coachId)
    return ["attributed-elsewhere", null];
  if (r.sessionState === "delivered") return ["ready", null];
  if (
    r.sessionState !== null &&
    ["scored", "delivery_pending", "delivering", "delivery_failed"].includes(
      r.sessionState,
    ) &&
    (r.holdKind !== null || r.releaseRequired || r.parallelRun)
  )
    return ["held", null];
  return ["processing", null];
}

export async function discardUpload(
  trx: CoachReportsWriter,
  uploadId: string,
  garbage: string[] = [],
): Promise<boolean> {
  const upload = await trx
    .selectFrom("coach_uploads")
    .select(["source_session_id", "parts", "state"])
    .select(
      sql<boolean>`claimed_at IS NOT NULL AND claimed_at > now() - interval '2 hours'`.as(
        "processing",
      ),
    )
    .where("id", "=", uploadId as never)
    .forUpdate()
    .executeTakeFirst();
  if (!upload) return false;
  if (upload.state === "received" && upload.processing) return false;
  if (upload.source_session_id) {
    const session = await trx
      .selectFrom("coach_intake_sessions")
      .select(["state", "published", "delivered_to"])
      .where("source_session_id", "=", upload.source_session_id)
      .forUpdate()
      .executeTakeFirst();
    if (
      session &&
      (session.state === "delivered" ||
        session.state === "delivering" ||
        session.published ||
        session.delivered_to.length > 0)
    )
      return false;
    const assets = await trx
      .selectFrom("coach_session_assets")
      .select("storage_key")
      .where("source_session_id", "=", upload.source_session_id)
      .execute();
    garbage.push(...assets.map((a) => a.storage_key));
    await trx
      .deleteFrom("coach_reports")
      .where("source_session_id", "=", upload.source_session_id)
      .execute();
    await trx
      .deleteFrom("coach_session_assets")
      .where("source_session_id", "=", upload.source_session_id)
      .execute();
    await trx
      .deleteFrom("coach_intake_sessions")
      .where("source_session_id", "=", upload.source_session_id)
      .execute();
  }
  if (upload.state === "awaiting-file" || upload.state === "received")
    garbage.push(...partKeys(uploadId, upload.parts));
  await trx
    .updateTable("coach_uploads")
    .set({ state: "discarded" })
    .where("id", "=", uploadId as never)
    .execute();
  return true;
}

export function partKeys(uploadId: string, parts: number): string[] {
  return Array.from({ length: parts }, (_, i) =>
    uploadPartKey(uploadId, i + 1),
  );
}

export const ALREADY_RECORDED =
  "the recording bot recorded this class on this date while the file was uploading";

export function uploadTitle(title: string | null | undefined): string | null {
  return (
    (title ?? "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, UPLOAD_TITLE_CHARS) || null
  );
}

function leaderClasses(
  conn: CoachReportsWriter | ReturnType<db["getOrCreateConnection"]>,
  leader: { email: string; user_id: string | null },
) {
  const base = (conn as CoachReportsWriter)
    .selectFrom("coach_classes")
    .innerJoin("user", "user.id", "coach_classes.user_id");
  return leader.user_id
    ? base.where("coach_classes.user_id", "=", leader.user_id as never)
    : base.where(sql`lower("user".email)`, "=", leader.email.toLowerCase());
}

async function botRecorded(
  conn: CoachReportsWriter | ReturnType<db["getOrCreateConnection"]>,
  classKey: string,
  date: string,
): Promise<boolean> {
  const recorded = await (conn as CoachReportsWriter)
    .selectFrom("coach_intake_sessions")
    .select("source_session_id")
    .where("source", "=", "bot")
    .where("class_key", "=", classKey)
    .where("session_date", "=", sql<Date>`${date}::date`)
    .where((eb) =>
      eb.or([
        eb("coach_id", "is not", null),
        eb("rotating_class_id", "is not", null),
      ]),
    )
    .where("state", "in", USABLE_BOT_STATES)
    .executeTakeFirst();
  return recorded !== undefined;
}

export async function markLikelyDuplicate(
  conn: CoachReportsWriter,
  sourceSessionId: string,
): Promise<boolean> {
  const session = await conn
    .selectFrom("coach_intake_sessions")
    .select(["coach_id", "class_key", "source", "state", "rotating_class_id"])
    .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
    .where("source_session_id", "=", sourceSessionId)
    .executeTakeFirst();
  if (
    !session ||
    session.source !== "bot" ||
    (!session.coach_id && session.rotating_class_id === null) ||
    !session.class_key ||
    session.state !== "retained"
  )
    return false;
  const upload = await conn
    .selectFrom("coach_intake_sessions")
    .select("source_session_id")
    .where("source", "=", "upload")
    .where("class_key", "=", session.class_key)
    .where("session_date", "=", sql<Date>`${session.date}::date`)
    .where("state", "not in", ["upload_failed", "duplicate"])
    .executeTakeFirst();
  if (!upload) return false;
  await conn
    .updateTable("coach_intake_sessions")
    .set({
      state: "duplicate",
      duplicate_of: upload.source_session_id,
      duplicate_dismissed_at: null,
      updated_at: sql`now()`,
    })
    .where("source_session_id", "=", sourceSessionId)
    .execute();
  return true;
}

export function normalizedMeetingLink(link: string | null | undefined) {
  const trimmed = (link ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

export async function botClassKey(
  conn: CoachReportsWriter,
  session: {
    coachId: string | null;
    rotatingClassId: number | null;
    meetingLink: string | null;
  },
): Promise<string | null> {
  if (session.rotatingClassId !== null)
    return `rotating:${session.rotatingClassId}`;
  if (!session.coachId) return null;
  const leader = await conn
    .selectFrom("coach_leaders")
    .select(["email", "user_id"])
    .where("slug", "=", session.coachId)
    .executeTakeFirst();
  if (!leader) return `group:${session.coachId}`;
  const classes = await leaderClasses(conn, leader)
    .select(["coach_classes.id as id", "coach_classes.zoom_link as link"])
    .execute();
  const link = normalizedMeetingLink(session.meetingLink);
  const linked = link
    ? classes.find((c) => normalizedMeetingLink(c.link) === link)
    : undefined;
  if (linked) return `class:${linked.id}`;
  if (classes.length === 1) return `class:${classes[0].id}`;
  if (classes.length === 0) return `group:${session.coachId}`;
  return null;
}
