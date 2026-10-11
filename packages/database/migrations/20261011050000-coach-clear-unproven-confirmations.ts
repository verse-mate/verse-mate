import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { DISCARD_FLAG } from "./20261011010000-coach-reports-and-roster";

export const RESTORE_FLAG = "COACH_ROLLBACK_RESTORE_CONFIRMATIONS";

export async function clearUnprovenRosterConfirmations(
  db: Kysely<Database>,
): Promise<void> {
  await sql`
    SELECT coach_clear_unproven_confirmation(email, 'sweep')
    FROM (SELECT email FROM coach_leaders UNION SELECT email FROM coach_admins) a
  `.execute(db);
}

export async function up(db: Kysely<Database>): Promise<void> {
  await clearUnprovenRosterConfirmations(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  if (process.env[RESTORE_FLAG] !== "1") {
    const { rows } = await sql<{
      n: number;
    }>`SELECT count(*)::int AS n FROM coach_confirmation_clears`.execute(db);
    const n = rows[0]?.n ?? 0;
    if (n === 0 || process.env[DISCARD_FLAG] === "1") return;
    throw new Error(
      `coach_confirmation_clears holds ${n} cleared confirmation(s). Read the rollback runbook first: a restored account is as unproven as it was before the deploy. Then rerun the down with ${RESTORE_FLAG}=1 to confirm those accounts again and restore their removed links where still possible, or with ${DISCARD_FLAG}=1 to leave them cleared.`,
    );
  }
  const { rows } = await sql<{
    accounts: number;
    links: number;
    relinked: number;
    kept: number;
  }>`
    WITH restorable AS (
      SELECT c.id, c.user_id, c.email, c.password_fingerprint, c.removed_links
      FROM coach_confirmation_clears c
      JOIN "user" u ON u.id = c.user_id
      WHERE lower(trim(u.email)) = lower(trim(c.email))
        AND NOT u."emailVerified"
        AND md5(coalesce(u.password, '')) = c.password_fingerprint
    ), confirmed AS (
      UPDATE "user" u SET "emailVerified" = true
      FROM restorable r
      WHERE u.id = r.user_id
        AND lower(trim(u.email)) = lower(trim(r.email))
        AND NOT u."emailVerified"
        AND md5(coalesce(u.password, '')) = r.password_fingerprint
      RETURNING u.id
    ), restored AS (
      SELECT r.* FROM restorable r JOIN confirmed c ON c.id = r.user_id
    ), relinked AS (
      INSERT INTO user_sso_accounts (id, user_id, provider, provider_user_id, email, created_at)
      SELECT l.id, l.user_id, l.provider, l.provider_user_id, l.email, l.created_at
      FROM restored r, jsonb_populate_recordset(NULL::user_sso_accounts, r.removed_links) l
      ON CONFLICT DO NOTHING
      RETURNING id
    ), forgotten AS (
      DELETE FROM coach_confirmation_clears
      WHERE id IN (SELECT id FROM restored)
      RETURNING id
    )
    SELECT
      (SELECT count(*) FROM confirmed)::int AS accounts,
      (SELECT coalesce(sum(jsonb_array_length(removed_links)), 0) FROM restored)::int AS links,
      (SELECT count(*) FROM relinked)::int AS relinked,
      ((SELECT count(*) FROM coach_confirmation_clears) - (SELECT count(*) FROM forgotten))::int AS kept
  `.execute(db);
  const [{ accounts, links, relinked, kept }] = rows;
  console.log(
    `coach confirmation clears: ${accounts} account(s) confirmed again, ${relinked} of ${links} removed provider link(s) restored (${links - relinked} skipped: that provider account is linked already), ${kept} record(s) left that could not be restored (the account changed address or password, or is confirmed again)`,
  );
}
