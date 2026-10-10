import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function clearUnprovenRosterConfirmations(
  db: Kysely<Database>,
): Promise<void> {
  await sql`
    SELECT coach_clear_unproven_confirmation(email)
    FROM (SELECT email FROM coach_leaders UNION SELECT email FROM coach_admins) a
  `.execute(db);
}

const STAMP_164000 = sql`
  CREATE OR REPLACE FUNCTION stamp_email_verified_at() RETURNS trigger AS $$
  BEGIN
    IF NOT NEW."emailVerified" THEN
      NEW.email_verified_at := NULL;
    ELSIF TG_OP = 'INSERT' OR NOT OLD."emailVerified" THEN
      NEW.email_verified_at := now();
    END IF;
    RETURN NEW;
  END
  $$ LANGUAGE plpgsql
`;

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE OR REPLACE FUNCTION stamp_email_verified_at() RETURNS trigger AS $$
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
  await sql`DROP TRIGGER stamp_email_verified_at ON "user"`.execute(db);
  await sql`
    CREATE TRIGGER stamp_email_verified_at
    BEFORE INSERT OR UPDATE OF "emailVerified", email ON "user"
    FOR EACH ROW EXECUTE FUNCTION stamp_email_verified_at()
  `.execute(db);
  await sql`
    CREATE FUNCTION coach_clear_unproven_confirmation(address text) RETURNS void AS $$
      WITH cleared AS (
        SELECT u.id, u.email FROM "user" u
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
      )
      UPDATE "user" SET "emailVerified" = false
      WHERE id IN (SELECT id FROM cleared)
    $$ LANGUAGE sql
  `.execute(db);
  await sql`
    CREATE FUNCTION coach_address_joined() RETURNS trigger AS $$
    BEGIN
      PERFORM coach_clear_unproven_confirmation(NEW.email);
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
  await clearUnprovenRosterConfirmations(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS coach_address_joined ON coach_admins`.execute(
    db,
  );
  await sql`DROP TRIGGER IF EXISTS coach_address_joined ON coach_leaders`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS coach_address_joined()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS coach_clear_unproven_confirmation(text)`.execute(
    db,
  );
  await STAMP_164000.execute(db);
  await sql`DROP TRIGGER stamp_email_verified_at ON "user"`.execute(db);
  await sql`
    CREATE TRIGGER stamp_email_verified_at
    BEFORE INSERT OR UPDATE OF "emailVerified" ON "user"
    FOR EACH ROW EXECUTE FUNCTION stamp_email_verified_at()
  `.execute(db);
}
