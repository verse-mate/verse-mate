import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("user")
    .addColumn("email_verified_at", "timestamptz")
    .execute();
  await sql`
    CREATE FUNCTION stamp_email_verified_at() RETURNS trigger AS $$
    BEGIN
      IF NOT NEW."emailVerified" THEN
        NEW.email_verified_at := NULL;
      ELSIF TG_OP = 'INSERT' OR NOT OLD."emailVerified" THEN
        NEW.email_verified_at := now();
      END IF;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER stamp_email_verified_at
    BEFORE INSERT OR UPDATE OF "emailVerified" ON "user"
    FOR EACH ROW EXECUTE FUNCTION stamp_email_verified_at()
  `.execute(db);
  await db.schema
    .alterTable("coach_leaders")
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_leaders_user_uidx
    ON coach_leaders (user_id) WHERE user_id IS NOT NULL
  `.execute(db);
  await db.schema
    .alterTable("coach_admins")
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_admins_user_uidx
    ON coach_admins (user_id) WHERE user_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_leaders", "user_id IS NOT NULL");
  await refuseToDrop(db, "coach_admins", "user_id IS NOT NULL");
  await sql`DROP INDEX IF EXISTS coach_admins_user_uidx`.execute(db);
  await sql`DROP INDEX IF EXISTS coach_leaders_user_uidx`.execute(db);
  await db.schema.alterTable("coach_admins").dropColumn("user_id").execute();
  await db.schema.alterTable("coach_leaders").dropColumn("user_id").execute();
  await sql`DROP TRIGGER IF EXISTS stamp_email_verified_at ON "user"`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS stamp_email_verified_at()`.execute(db);
  await db.schema.alterTable("user").dropColumn("email_verified_at").execute();
}
