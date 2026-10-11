import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

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
  const { rows } = await sql<{
    accounts: number;
    links: number;
    relinked: number;
    kept: number;
  }>`
    WITH restorable AS (
      SELECT c.id, c.user_id, c.removed_links FROM coach_confirmation_clears c
      JOIN "user" u ON u.id = c.user_id
      WHERE lower(trim(u.email)) = lower(trim(c.email))
        AND NOT u."emailVerified"
    ), confirmed AS (
      UPDATE "user" SET "emailVerified" = true
      WHERE id IN (SELECT user_id FROM restorable)
      RETURNING id
    ), relinked AS (
      INSERT INTO user_sso_accounts
      SELECT (jsonb_populate_record(NULL::user_sso_accounts, link)).*
      FROM restorable r, jsonb_array_elements(r.removed_links) link
      ON CONFLICT DO NOTHING
      RETURNING id
    ), restored AS (
      DELETE FROM coach_confirmation_clears
      WHERE id IN (SELECT id FROM restorable)
      RETURNING id
    )
    SELECT
      (SELECT count(*) FROM confirmed)::int AS accounts,
      (SELECT coalesce(sum(jsonb_array_length(removed_links)), 0) FROM restorable)::int AS links,
      (SELECT count(*) FROM relinked)::int AS relinked,
      ((SELECT count(*) FROM coach_confirmation_clears) - (SELECT count(*) FROM restored))::int AS kept
  `.execute(db);
  const { accounts, links, relinked, kept } = rows[0] ?? {
    accounts: 0,
    links: 0,
    relinked: 0,
    kept: 0,
  };
  console.log(
    `coach confirmation clears: ${accounts} account(s) confirmed again, ${relinked} of ${links} removed provider link(s) restored (${links - relinked} skipped: the provider account is linked again already), ${kept} record(s) left that could not be restored (the account changed address or is confirmed again)`,
  );
}
