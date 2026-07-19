import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

/**
 * Persistence for the coach portal's one mutable field: the leader's meeting
 * (Zoom / Meet / Teams) link. Reports + trends come from the bundled dataset;
 * only this link is user-writable, so it lives in coach_zoom_links (one row
 * per user).
 */
export class CoachRepository {
  constructor(private readonly db: db) {}

  /** Returns the saved link, or null when the user has never set one. */
  async getZoomLink(userId: string): Promise<string | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_zoom_links")
      .where("user_id", "=", userId)
      .select(["zoom_link"])
      .executeTakeFirst();

    return row ? row.zoom_link : null;
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
}
