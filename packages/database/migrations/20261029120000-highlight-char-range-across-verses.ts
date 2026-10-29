import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

/**
 * A char-precise highlight runs from start_char in start_verse to end_char in
 * end_verse, so across verses start_char > end_char is a valid range (late in
 * verse 12 → early in verse 13). The old check_valid_char_range demanded
 * start_char <= end_char even across verses, and addHighlight "fixed" such a
 * request by swapping the offsets, storing a different range than the one the
 * reader selected. The order of the offsets is only meaningful within one
 * verse.
 *
 * The new rule is strictly weaker than the old one, so every existing row
 * passes it. check_non_negative_chars is unchanged.
 *
 * Swapping the constraint takes an ACCESS EXCLUSIVE lock on verse_highlights;
 * like the coach migrations, give up after 5 s (the deploy retries) rather
 * than queue every reader's highlight request behind a long-running query.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await sql`
    ALTER TABLE verse_highlights
      DROP CONSTRAINT check_valid_char_range,
      ADD CONSTRAINT check_valid_char_range CHECK (
        (start_char IS NULL AND end_char IS NULL)
        OR (
          start_char IS NOT NULL AND end_char IS NOT NULL
          AND (start_verse < end_verse OR start_char <= end_char)
        )
      )
  `.execute(db);
}

/**
 * Restores the old rule for new writes. It is added NOT VALID: rows saved
 * under the new rule (start_char > end_char across verses) are correct data
 * and stay as they are, rather than failing the rollback or being rewritten.
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await sql`SET LOCAL lock_timeout = '5s'`.execute(db);
  await sql`
    ALTER TABLE verse_highlights
      DROP CONSTRAINT check_valid_char_range,
      ADD CONSTRAINT check_valid_char_range CHECK (
        (start_char IS NULL AND end_char IS NULL)
        OR (
          start_char IS NOT NULL AND end_char IS NOT NULL
          AND start_char <= end_char
        )
      ) NOT VALID
  `.execute(db);
}
