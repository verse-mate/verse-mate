import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await sql`
    UPDATE "user" AS u
    SET email_verified_at = NULL
    WHERE u.email_verified_at >= (
      SELECT "timestamp"::timestamptz FROM kysely_migration
      WHERE name = '20261011000000-user-confirmation-stamp'
    )
    AND EXISTS (
      SELECT 1 FROM user_sso_accounts AS s
      WHERE s.user_id = u.id
        AND lower(trim(s.email)) <> lower(trim(u.email))
    )
  `.execute(db);
}

export async function down(): Promise<void> {}
