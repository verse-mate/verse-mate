import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 5 of 9 (change: port-coach-pipeline, design D13).
 *
 * The program-admin role becomes data. `coach.service.ts` resolved admin
 * authority from the compiled-in bundle's `admins` array, so deleting the
 * bundle (task 7.1) would remove the ONLY source of admin authority — this
 * table is what stops the ungated half of the change taking away every admin
 * capability. The program admin is not a roster leader, so the grant is
 * explicit rather than derived from `coach_leaders`.
 *
 * Scope is homing the LIST. Verified-email enforcement and account binding stay
 * gated behind §10; a row here means "this address is the program admin",
 * exactly as the bundle array did, with no change in trust model.
 *
 * `email` is normalized to lower case by a trigger rather than by convention:
 * the bundle lookup lower-cased both sides, and a stored `Andy@…` that no
 * lookup matches is an admin silently losing their capabilities.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_admins ...");
  await db.schema
    .createTable("coach_admins")
    .addColumn("email", "text", (col) => col.primaryKey())
    .addColumn("granted_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("granted_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await sql`
    CREATE FUNCTION coach_admins_normalize_email()
    RETURNS trigger AS $$
    BEGIN
      NEW.email = lower(btrim(NEW.email));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);
  await sql`
    CREATE TRIGGER coach_admins_normalize_email_trg
    BEFORE INSERT OR UPDATE ON coach_admins
    FOR EACH ROW EXECUTE FUNCTION coach_admins_normalize_email();
  `.execute(db);

  // The program admin, carried over from the bundle's `admins` array so the
  // role survives the bundle's deletion. Idempotent: re-running grants nothing
  // twice, and an operator who has already revoked it is not overridden by a
  // later re-run, because the migration only ever runs once.
  await sql`
    INSERT INTO coach_admins (email) VALUES ('andytryba@gmail.com')
    ON CONFLICT (email) DO NOTHING
  `.execute(db);

  console.log("coach_admins created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS coach_admins_normalize_email_trg ON coach_admins`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS coach_admins_normalize_email()`.execute(db);
  await db.schema.dropTable("coach_admins").ifExists().execute();
}
