import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20261011010000-coach-reports-and-roster";

const TABLES = [
  "coach_confirmation_clears",
  "coach_leader_email_requests",
  "coach_leader_email_changes",
];

export async function up(db: Kysely<Database>): Promise<void> {
  for (const table of ["coach_leaders", "coach_admins"] as const)
    await db.schema
      .alterTable(table)
      .addColumn("user_id", "uuid", (col) =>
        col.references("user.id").onDelete("set null"),
      )
      .execute();
  await sql`
    CREATE UNIQUE INDEX coach_leaders_user_uidx
    ON coach_leaders (user_id) WHERE user_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX coach_admins_user_uidx
    ON coach_admins (user_id) WHERE user_id IS NOT NULL
  `.execute(db);

  await db.schema
    .createTable("coach_leader_email_changes")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("previous_email", "text", (col) => col.notNull())
    .addColumn("new_email", "text", (col) => col.notNull())
    .addColumn("changed_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("changed_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
  await db.schema
    .createIndex("coach_leader_email_changes_slug_idx")
    .on("coach_leader_email_changes")
    .columns(["slug", "changed_at"])
    .execute();

  await db.schema
    .createTable("coach_leader_email_requests")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("new_email", "text", (col) => col.notNull())
    .addColumn("requested_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("token_hash", "text", (col) => col.notNull().unique())
    .addColumn("status", "text", (col) =>
      col
        .notNull()
        .defaultTo("pending")
        .check(
          sql`status IN ('pending', 'confirmed', 'superseded', 'refused')`,
        ),
    )
    .addColumn("refusal", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("resolved_at", "timestamptz")
    .execute();
  await db.schema
    .createIndex("coach_leader_email_requests_slug_idx")
    .on("coach_leader_email_requests")
    .columns(["slug", "id"])
    .execute();

  await db.schema
    .createTable("coach_confirmation_clears")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("password_fingerprint", "text", (col) => col.notNull())
    .addColumn("removed_links", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("source", "text", (col) =>
      col.notNull().check(sql`source IN ('sweep', 'joined')`),
    )
    .addColumn("cleared_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex("coach_confirmation_clears_user_idx")
    .on("coach_confirmation_clears")
    .column("user_id")
    .execute();

  await sql`
    CREATE FUNCTION coach_clear_unproven_confirmation(address text, origin text) RETURNS void AS $$
      WITH cleared AS (
        SELECT u.id, u.email, md5(coalesce(u.password, '')) AS password_fingerprint FROM "user" u
        WHERE lower(trim(u.email)) = lower(trim(address))
          AND u."emailVerified"
          AND u.email_verified_at IS NULL
          AND NOT (
            u.password IS NULL
            AND EXISTS (SELECT 1 FROM user_sso_accounts s WHERE s.user_id = u.id)
            AND NOT EXISTS (
              SELECT 1 FROM user_sso_accounts s
              WHERE s.user_id = u.id
                AND lower(trim(s.email)) <> lower(trim(u.email))
            )
          )
      ), foreign_links AS (
        DELETE FROM user_sso_accounts s USING cleared c
        WHERE s.user_id = c.id AND lower(trim(s.email)) <> lower(trim(c.email))
        RETURNING s.*
      ), recorded AS (
        INSERT INTO coach_confirmation_clears (user_id, email, password_fingerprint, removed_links, source)
        SELECT c.id, c.email, c.password_fingerprint,
          coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM foreign_links f WHERE f.user_id = c.id), '[]'::jsonb),
          origin
        FROM cleared c
      )
      UPDATE "user" SET "emailVerified" = false
      WHERE id IN (SELECT id FROM cleared)
    $$ LANGUAGE sql SET search_path = public, pg_temp
  `.execute(db);
  await sql`
    CREATE FUNCTION coach_address_joined() RETURNS trigger AS $$
    BEGIN
      PERFORM coach_clear_unproven_confirmation(NEW.email, 'joined');
      RETURN NULL;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);
  for (const table of ["coach_leaders", "coach_admins"])
    await sql`
      CREATE TRIGGER coach_address_joined
      AFTER INSERT OR UPDATE OF email ON ${sql.table(table)}
      FOR EACH ROW EXECUTE FUNCTION coach_address_joined()
    `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_leaders", "user_id IS NOT NULL");
  await refuseToDrop(db, "coach_admins", "user_id IS NOT NULL");
  for (const table of TABLES) await refuseToDrop(db, table);
  await sql`DROP TRIGGER coach_address_joined ON coach_admins`.execute(db);
  await sql`DROP TRIGGER coach_address_joined ON coach_leaders`.execute(db);
  await sql`DROP FUNCTION coach_address_joined()`.execute(db);
  await sql`DROP FUNCTION coach_clear_unproven_confirmation(text, text)`.execute(
    db,
  );
  for (const table of TABLES) await db.schema.dropTable(table).execute();
  await sql`DROP INDEX coach_admins_user_uidx`.execute(db);
  await sql`DROP INDEX coach_leaders_user_uidx`.execute(db);
  await db.schema.alterTable("coach_admins").dropColumn("user_id").execute();
  await db.schema.alterTable("coach_leaders").dropColumn("user_id").execute();
}
