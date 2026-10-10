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

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE FUNCTION coach_clear_unproven_confirmation(address text) RETURNS void AS $$
      UPDATE "user" u SET "emailVerified" = false
      WHERE lower(u.email) = lower(trim(address))
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
}
