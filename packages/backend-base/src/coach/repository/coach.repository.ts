import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

/** The coach portal's user-writable setup fields (one row per user). */
export interface CoachSettings {
  zoomLink: string;
  affiliatedChurch: string;
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

/**
 * Persistence for the coach portal's mutable state:
 *   - coach_zoom_links — the leader's single quick meeting link + affiliated
 *     church (one row per user)
 *   - coach_classes    — the leader's registered classes (many rows per user)
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
      .select(["zoom_link", "affiliated_church"])
      .executeTakeFirst();

    return row
      ? { zoomLink: row.zoom_link, affiliatedChurch: row.affiliated_church }
      : null;
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

  // ─── Classes (many rows per user) ─────────────────────────────────────────

  /** A `date` column comes back as a JS Date (or a string, depending on the
   *  driver). Normalize either to ISO yyyy-mm-dd, or null. */
  private static toIsoDate(value: Date | string | null): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    // Already a string like "2026-07-21" (or an ISO timestamp) — keep the day.
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
    return (res?.numDeletedRows ?? 0n) > 0n;
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
}
