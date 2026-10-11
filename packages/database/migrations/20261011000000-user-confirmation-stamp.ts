import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await db.schema
    .alterTable("user")
    .addColumn("email_verified_at", "timestamptz")
    .execute();
  await sql`
    CREATE FUNCTION stamp_email_verified_at() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE'
        AND lower(trim(NEW.email)) IS DISTINCT FROM lower(trim(OLD.email)) THEN
        NEW."emailVerified" := false;
      END IF;
      IF NOT NEW."emailVerified" THEN
        NEW.email_verified_at := NULL;
      ELSIF TG_OP = 'INSERT' AND NEW.email_verified_at IS NULL THEN
        NEW.email_verified_at := now();
      END IF;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER stamp_email_verified_at
    BEFORE INSERT OR UPDATE OF "emailVerified", email ON "user"
    FOR EACH ROW EXECUTE FUNCTION stamp_email_verified_at()
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await sql`LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE`.execute(db);
  if (process.env.ROLLBACK_DISCARD_CONFIRMATION_STAMPS !== "1") {
    const { rows } = await sql<{ stamped: number }>`
      SELECT count(*)::int AS stamped FROM "user"
      WHERE email_verified_at IS NOT NULL
    `.execute(db);
    const stamped = rows[0]?.stamped ?? 0;
    if (stamped > 0)
      throw new Error(
        `Refusing to drop user.email_verified_at: ${stamped} account(s) carry a confirmation stamp. Set ROLLBACK_DISCARD_CONFIRMATION_STAMPS=1 to drop them.`,
      );
  }
  await sql`DROP TRIGGER IF EXISTS stamp_email_verified_at ON "user"`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS stamp_email_verified_at()`.execute(db);
  await db.schema.alterTable("user").dropColumn("email_verified_at").execute();
}
