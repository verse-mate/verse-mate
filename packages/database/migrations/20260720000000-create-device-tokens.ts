import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Push-notification storage (GH-281).
 *
 *   device_tokens          — one row per (user, Expo push token). A token is
 *                            unique per user among LIVE rows; soft-deleted rows
 *                            (deleted_at set) don't collide, so a reinstall or
 *                            account-switch can re-register the same token
 *                            without a constraint violation. The unique index
 *                            is NULLS NOT DISTINCT (Postgres 15+) so
 *                            deleted_at IS NULL rows enforce uniqueness while
 *                            soft-deleted rows are ignored — this is what makes
 *                            the account-switch upsert (soft-delete the token
 *                            under the old user, then insert under the new one)
 *                            work.
 *
 *                            `last_notified_on` is the idempotency guard for
 *                            the daily verse-of-the-day fan-out (D-11): the
 *                            worker only selects tokens whose value differs
 *                            from today, and stamps it after a successful send,
 *                            so a retry / double cron tick / manual re-trigger
 *                            never double-notifies. A date (not a boolean) is
 *                            self-resetting — today's send supersedes
 *                            yesterday's value, no nightly clear job.
 *
 *                            The per-token preferred Bible version is NOT stored
 *                            here — the worker reads user.preferred_bible_version
 *                            (the same source the /bible/verse-of-the-day
 *                            endpoint already falls back to), keeping a single
 *                            source of truth.
 *
 *   notification_broadcasts — audit trail for the admin "send to everyone"
 *                            action (D-14). One row per broadcast: who sent it,
 *                            the payload, and how many active tokens it targeted.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating device_tokens table...");

  await db.schema
    .createTable("device_tokens")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("token", "text", (col) => col.notNull())
    .addColumn("platform", "varchar(10)", (col) => col.notNull())
    .addColumn("last_notified_on", "date")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamp")
    .execute();

  // A live token is unique per user; soft-deleted rows (deleted_at set) are
  // ignored so the account-switch/reinstall upsert doesn't collide.
  await sql`
    CREATE UNIQUE INDEX idx_device_tokens_unique
    ON device_tokens (user_id, token, deleted_at)
    NULLS NOT DISTINCT
  `.execute(db);

  // The daily worker scans "active tokens not yet notified today". Partial
  // index over live rows keeps that scan cheap as soft-deleted rows accumulate.
  await sql`
    CREATE INDEX idx_device_tokens_active_notify
    ON device_tokens (last_notified_on)
    WHERE deleted_at IS NULL
  `.execute(db);

  console.log("Creating notification_broadcasts table...");

  await db.schema
    .createTable("notification_broadcasts")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("admin_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("deep_link", "text")
    .addColumn("recipient_count", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("notification_broadcasts").ifExists().execute();
  await db.schema.dropTable("device_tokens").ifExists().execute();
}
