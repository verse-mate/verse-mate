import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

/** The coach portal's user-writable setup fields (one row per user). */
export interface CoachSettings {
  zoomLink: string;
  affiliatedChurch: string;
}

/**
 * Persistence for the coach portal's mutable setup fields: the leader's
 * meeting (Zoom / Meet / Teams) link and their affiliated church. Reports +
 * trends come from the bundled dataset; only these fields are user-writable,
 * so they live in coach_zoom_links (one row per user).
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
}
