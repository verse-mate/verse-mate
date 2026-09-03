import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

/** The coach portal's user-writable setup fields (one row per user). */
export interface CoachSettings {
  zoomLink: string;
  affiliatedChurch: string;
  bibleCoach: string;
}

/** A persisted class row as returned to the service layer (dates normalized
 *  to ISO yyyy-mm-dd strings so the JSON contract is stable). */
export interface CoachClassRow {
  id: string;
  name: string;
  classDate: string | null;
  recurrence: string;
  zoomLink: string;
}

/** Fields a caller may set when creating / updating a class. */
export interface CoachClassInput {
  name: string;
  classDate: string | null;
  recurrence: string;
  zoomLink: string;
}

/** One leader's classes plus who they belong to (admin export shape). */
export interface CoachClassWithOwner extends CoachClassRow {
  userId: string;
}

/** A roster leader row from coach_leaders. */
export interface AddedLeaderRow {
  id: string;
  /**
   * The dataset slug every overlay keys on, coach_reports.coach_id,
   * coach_notes.coach_id, coach_recording_links.coach_id. Null only for a row
   * added before task 3.1, or one 3.10's backfill has not reached.
   */
  slug: string | null;
  email: string;
  name: string;
  group_name: string;
  coach_name: string;
}

/** A persisted coaching note on a specific session. */
export interface CoachNoteRow {
  id: string;
  coachId: string;
  reportId: string;
  body: string;
  emailed: boolean;
  createdAt: string;
}

/**
 * Persistence for the coach portal's mutable state:
 *   - coach_zoom_links, the leader's single quick meeting link + affiliated
 *     church (one row per user)
 *   - coach_classes   , the leader's registered classes (many rows per user)
 *
 * Reports + trends come from the bundled dataset; these tables are the only
 * user-writable state.
 */
export class CoachRepository {
  constructor(private readonly db: db) {}

  /** Returns the saved setup fields, or null when the user has no row yet. */
  async getSettings(userId: string): Promise<CoachSettings | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_zoom_links")
      .where("user_id", "=", userId)
      .select(["zoom_link", "affiliated_church", "bible_coach"])
      .executeTakeFirst();

    return row
      ? {
          zoomLink: row.zoom_link,
          affiliatedChurch: row.affiliated_church,
          bibleCoach: row.bible_coach,
        }
      : null;
  }

  /** The saved meeting link for the account whose email matches `email`
   *  (case-insensitive), or "" when there is no matching account or no saved
   *  link. Used to auto-attach a leader's recurring meeting link (where the
   *  Fireflies Notetaker records) as the default recording link on each of
   *  their sessions. */
  async getZoomLinkByEmail(email: string): Promise<string> {
    const target = email.trim().toLowerCase();
    if (!target) return "";
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_zoom_links")
      .innerJoin("user", "user.id", "coach_zoom_links.user_id")
      .where(sql<boolean>`lower("user"."email") = ${target}`)
      .select("coach_zoom_links.zoom_link")
      .executeTakeFirst();
    return row?.zoom_link ?? "";
  }

  /** Upserts the link for a user and returns the stored value. */
  async setZoomLink(userId: string, zoomLink: string): Promise<string> {
    await this.db
      .getOrCreateConnection()
      .insertInto("coach_zoom_links")
      .values({ user_id: userId, zoom_link: zoomLink })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          zoom_link: zoomLink,
          updated_at: sql`NOW()`,
        }),
      )
      .execute();

    return zoomLink;
  }

  /** Upserts the affiliated church for a user and returns the stored value. */
  async setAffiliatedChurch(
    userId: string,
    affiliatedChurch: string,
  ): Promise<string> {
    await this.db
      .getOrCreateConnection()
      .insertInto("coach_zoom_links")
      .values({ user_id: userId, affiliated_church: affiliatedChurch })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          affiliated_church: affiliatedChurch,
          updated_at: sql`NOW()`,
        }),
      )
      .execute();

    return affiliatedChurch;
  }

  /** Upserts the selected Bible coach for a user and returns the stored value. */
  async setBibleCoach(userId: string, bibleCoach: string): Promise<string> {
    await this.db
      .getOrCreateConnection()
      .insertInto("coach_zoom_links")
      .values({ user_id: userId, bible_coach: bibleCoach })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          bible_coach: bibleCoach,
          updated_at: sql`NOW()`,
        }),
      )
      .execute();

    return bibleCoach;
  }

  // ─── Classes (many rows per user) ─────────────────────────────────────────

  /** A `date` column comes back as a JS Date (or a string, depending on the
   *  driver). Normalize either to ISO yyyy-mm-dd, or null. */
  private static toIsoDate(value: Date | string | null): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    // Already a string like "2026-07-21" (or an ISO timestamp), keep the day.
    return String(value).slice(0, 10);
  }

  private static rowToClass(row: {
    id: string;
    name: string;
    class_date: Date | string | null;
    recurrence: string;
    zoom_link: string;
  }): CoachClassRow {
    return {
      id: row.id,
      name: row.name,
      classDate: CoachRepository.toIsoDate(row.class_date),
      recurrence: row.recurrence,
      zoomLink: row.zoom_link,
    };
  }

  /** A leader's classes, most-recently-updated first. */
  async listClasses(userId: string): Promise<CoachClassRow[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_classes")
      .where("user_id", "=", userId)
      .select(["id", "name", "class_date", "recurrence", "zoom_link"])
      .orderBy("updated_at", "desc")
      .execute();
    return rows.map(CoachRepository.rowToClass);
  }

  /** Insert a class for a user and return the stored row. */
  async createClass(
    userId: string,
    input: CoachClassInput,
  ): Promise<CoachClassRow> {
    const row = await this.db
      .getOrCreateConnection()
      .insertInto("coach_classes")
      .values({
        user_id: userId,
        name: input.name,
        class_date: input.classDate,
        recurrence: input.recurrence,
        zoom_link: input.zoomLink,
      })
      .returning(["id", "name", "class_date", "recurrence", "zoom_link"])
      .executeTakeFirstOrThrow();
    return CoachRepository.rowToClass(row);
  }

  /** Update a class the user owns. Returns the stored row, or null when no row
   *  matches (unknown id or not the owner). */
  async updateClass(
    userId: string,
    classId: string,
    input: CoachClassInput,
  ): Promise<CoachClassRow | null> {
    const row = await this.db
      .getOrCreateConnection()
      .updateTable("coach_classes")
      .set({
        name: input.name,
        class_date: input.classDate,
        recurrence: input.recurrence,
        zoom_link: input.zoomLink,
        updated_at: sql`NOW()`,
      })
      .where("id", "=", classId)
      .where("user_id", "=", userId)
      .returning(["id", "name", "class_date", "recurrence", "zoom_link"])
      .executeTakeFirst();
    return row ? CoachRepository.rowToClass(row) : null;
  }

  /** Delete a class the user owns. Returns true when a row was removed. */
  async deleteClass(userId: string, classId: string): Promise<boolean> {
    const res = await this.db
      .getOrCreateConnection()
      .deleteFrom("coach_classes")
      .where("id", "=", classId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    // Number() rather than a 0n/`> 0n` BigInt comparison: the frontend-next
    // build compiles this file under a tsconfig target below ES2020, which
    // rejects BigInt literals (TS2737). numDeletedRows is a bigint; coerce it.
    return Number(res?.numDeletedRows ?? 0) > 0;
  }

  /** Every class across all leaders (admin export). Ordered by owner then
   *  name so the Fireflies feed is stable. */
  async listAllClasses(): Promise<CoachClassWithOwner[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_classes")
      .select([
        "id",
        "user_id",
        "name",
        "class_date",
        "recurrence",
        "zoom_link",
      ])
      .orderBy("user_id")
      .orderBy("name")
      .execute();
    return rows.map((r) => ({
      userId: r.user_id,
      ...CoachRepository.rowToClass(r),
    }));
  }
  // ─── Admin-added leaders ─────────────────────────────────────────────────

  /** Every admin-added leader, for merging into the roster. */
  async listAddedLeaders(): Promise<AddedLeaderRow[]> {
    return this.db
      .getOrCreateConnection()
      .selectFrom("coach_leaders")
      .select(["id", "slug", "email", "name", "group_name", "coach_name"])
      .execute();
  }

  /** Lookup by email (lowercased). null when not an admin-added leader. */
  async findAddedLeaderByEmail(email: string): Promise<AddedLeaderRow | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_leaders")
      .where("email", "=", email.trim().toLowerCase())
      .select(["id", "slug", "email", "name", "group_name", "coach_name"])
      .executeTakeFirst();
    return row ?? null;
  }

  /** Insert a new leader. Assumes the caller already checked for duplicates. */
  async addLeader(input: {
    email: string;
    name: string;
    group: string;
    coachName: string;
    invitedBy: string | null;
  }): Promise<AddedLeaderRow> {
    return this.db
      .getOrCreateConnection()
      .insertInto("coach_leaders")
      .values({
        email: input.email.trim().toLowerCase(),
        name: input.name,
        group_name: input.group,
        coach_name: input.coachName,
        invited_by: input.invitedBy,
      })
      .returning(["id", "slug", "email", "name", "group_name", "coach_name"])
      .executeTakeFirstOrThrow();
  }

  // ─── Recording links ─────────────────────────────────────────────────────

  /** Recording URLs for a whole coach, keyed by report id (bulk overlay). */
  async getRecordingLinksForCoach(
    coachId: string,
  ): Promise<Record<string, string>> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_recording_links")
      .where("coach_id", "=", coachId)
      .select(["report_id", "recording_url"])
      .execute();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.report_id] = r.recording_url;
    return map;
  }

  /** Upserts a session's recording URL and returns the stored value. */
  async setRecordingLink(
    coachId: string,
    reportId: string,
    recordingUrl: string,
  ): Promise<string> {
    await this.db
      .getOrCreateConnection()
      .insertInto("coach_recording_links")
      .values({
        coach_id: coachId,
        report_id: reportId,
        recording_url: recordingUrl,
      })
      .onConflict((oc) =>
        oc.columns(["coach_id", "report_id"]).doUpdateSet({
          recording_url: recordingUrl,
          updated_at: sql`NOW()`,
        }),
      )
      .execute();
    return recordingUrl;
  }

  // ─── Coaching notes ──────────────────────────────────────────────────────

  /** Notes for a coach (optionally one session), newest first. */
  async listNotes(coachId: string, reportId?: string): Promise<CoachNoteRow[]> {
    let q = this.db
      .getOrCreateConnection()
      .selectFrom("coach_notes")
      .where("coach_id", "=", coachId);
    if (reportId) q = q.where("report_id", "=", reportId);
    const rows = await q
      .select(["id", "coach_id", "report_id", "body", "emailed", "created_at"])
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(CoachRepository.toNoteRow);
  }

  /** Insert a note and return it (emailed flag decided by the caller). */
  async addNote(input: {
    coachId: string;
    reportId: string;
    authorUserId: string | null;
    body: string;
    emailed: boolean;
  }): Promise<CoachNoteRow> {
    const row = await this.db
      .getOrCreateConnection()
      .insertInto("coach_notes")
      .values({
        coach_id: input.coachId,
        report_id: input.reportId,
        author_user_id: input.authorUserId,
        body: input.body,
        emailed: input.emailed,
      })
      .returning([
        "id",
        "coach_id",
        "report_id",
        "body",
        "emailed",
        "created_at",
      ])
      .executeTakeFirstOrThrow();
    return CoachRepository.toNoteRow(row);
  }

  private static toNoteRow(row: {
    id: string;
    coach_id: string;
    report_id: string;
    body: string;
    emailed: boolean;
    created_at: Date | string;
  }): CoachNoteRow {
    return {
      id: row.id,
      coachId: row.coach_id,
      reportId: row.report_id,
      body: row.body,
      emailed: row.emailed,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    };
  }
}
