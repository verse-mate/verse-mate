import { sql } from "kysely";
import type { db } from "../../shared/shared.plugin";

/** A token owed today's verse, with the owner's preferred version. */
export interface TokenToNotify {
  id: string;
  token: string;
  userId: string;
  preferredBibleVersion: string | null;
}

/** A live token (broadcast fan-out). */
export interface ActiveToken {
  id: string;
  token: string;
  userId: string;
}

export interface BroadcastAuditInput {
  adminUserId: string | null;
  title: string;
  body: string;
  deepLink: string | null;
  recipientCount: number;
}

/**
 * Data access for push device tokens + broadcast audit. Pure persistence —
 * selection/idempotency/send decisions live in the service.
 */
export class NotificationsRepository {
  constructor(private readonly db: db) {}

  /**
   * Register (or keep) a token for a user. Account-switch-safe: if the token
   * is currently live under a DIFFERENT user (reinstall / shared device), it's
   * soft-deleted first, then inserted for the current user. A live row for the
   * same (user, token) is left untouched (ON CONFLICT DO NOTHING against the
   * NULLS NOT DISTINCT unique index).
   */
  async upsertDeviceToken({
    userId,
    token,
    platform,
  }: {
    userId: string;
    token: string;
    platform: string;
  }): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (tx) => {
        await tx
          .updateTable("device_tokens")
          .set({ deleted_at: sql`CURRENT_TIMESTAMP` })
          .where("token", "=", token)
          .where("user_id", "!=", userId)
          .where("deleted_at", "is", null)
          .execute();

        await tx
          .insertInto("device_tokens")
          .values({ user_id: userId, token, platform })
          .onConflict((oc) =>
            oc.columns(["user_id", "token", "deleted_at"]).doNothing(),
          )
          .execute();
      });
  }

  /** Soft-delete a user's live token (Settings toggle off / logout). */
  async softDeleteDeviceToken({
    userId,
    token,
  }: {
    userId: string;
    token: string;
  }): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("device_tokens")
      .set({ deleted_at: sql`CURRENT_TIMESTAMP` })
      .where("user_id", "=", userId)
      .where("token", "=", token)
      .where("deleted_at", "is", null)
      .execute();
  }

  /**
   * Live tokens not yet notified on `date`, with the owner's preferred version.
   * `IS DISTINCT FROM` treats a NULL last_notified_on as "not notified".
   */
  async listActiveTokensToNotify(date: string): Promise<TokenToNotify[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("device_tokens as dt")
      .innerJoin("user as u", "u.id", "dt.user_id")
      .where("dt.deleted_at", "is", null)
      .where(sql<boolean>`dt.last_notified_on IS DISTINCT FROM ${date}::date`)
      .select([
        "dt.id as id",
        "dt.token as token",
        "dt.user_id as userId",
        "u.preferred_bible_version as preferredBibleVersion",
      ])
      .execute();
    return rows as TokenToNotify[];
  }

  /** Stamp tokens as notified on `date` (idempotency guard, D-11). */
  async markNotified(tokenIds: string[], date: string): Promise<void> {
    if (tokenIds.length === 0) return;
    await this.db
      .getOrCreateConnection()
      .updateTable("device_tokens")
      .set({ last_notified_on: sql`${date}::date` })
      .where("id", "in", tokenIds)
      .execute();
  }

  /** All live tokens (broadcast fan-out). */
  async listAllActiveTokens(): Promise<ActiveToken[]> {
    const rows = await this.db
      .getOrCreateConnection()
      .selectFrom("device_tokens")
      .where("deleted_at", "is", null)
      .select(["id as id", "token as token", "user_id as userId"])
      .execute();
    return rows as ActiveToken[];
  }

  /** Count of live tokens (broadcast recipient-count preview). */
  async countActiveTokens(): Promise<number> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("device_tokens")
      .where("deleted_at", "is", null)
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  /** Soft-delete dead tokens (Expo reported DeviceNotRegistered). */
  async softDeleteTokensByValues(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.db
      .getOrCreateConnection()
      .updateTable("device_tokens")
      .set({ deleted_at: sql`CURRENT_TIMESTAMP` })
      .where("token", "in", tokens)
      .where("deleted_at", "is", null)
      .execute();
  }

  /** Record an admin broadcast (audit, D-14). */
  async insertBroadcast(input: BroadcastAuditInput): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .insertInto("notification_broadcasts")
      .values({
        admin_user_id: input.adminUserId,
        title: input.title,
        body: input.body,
        deep_link: input.deepLink,
        recipient_count: input.recipientCount,
      })
      .execute();
  }
}
