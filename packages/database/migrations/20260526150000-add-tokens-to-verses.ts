import type { Kysely } from "kysely";
import { sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Add a per-verse `tokens` JSONB column to the `verses` table to support
 * Strong's-tagged verse rendering. Tokens are an ordered array — joining
 * each token's `text` field byte-for-byte reproduces the verse text, so
 * legacy clients that don't request tagged verses are unaffected.
 *
 * Token shape (validated at API layer, not in the DB):
 *   [{"text": "JACOBO", "strongs": "G2385"}, {"text": ", siervo de "}, ...]
 *
 * Nullable: untagged versions (most non-pilot translations) keep tokens =
 * NULL and the chapter endpoint serves the legacy {verseNumber, text}
 * shape. The endpoint patch (separate PR) toggles tagged rendering via
 * a `?tagged=1` opt-in flag and falls back silently when tokens IS NULL.
 *
 * The partial index keeps "is this verse tagged?" lookups cheap by indexing
 * only the populated subset. Most rows are unset in the initial rollout.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("verses").addColumn("tokens", "jsonb").execute();

  await db.executeQuery(
    sql`CREATE INDEX IF NOT EXISTS idx_verses_tagged
        ON verses (version_id, chapter_id, verse_number)
        WHERE tokens IS NOT NULL`.compile(db),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS idx_verses_tagged`.compile(db),
  );

  await db.schema.alterTable("verses").dropColumn("tokens").execute();
}
