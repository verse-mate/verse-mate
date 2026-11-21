import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

/**
 * Take the duplicate Jesus entries out of the corpus.
 *
 * Each slug below told a scene that another entry already tells over the same
 * passage, e.g. "You must be born again" (John 3:1-21) next to "Nicodemus, by
 * night" (John 3:1-21). With no harmony key between them, each became its own
 * event, so Follow His Life, browse and search listed the same scene twice. The
 * earlier entry in LIFE_TIMELINE is the one kept. The kept entry is noted on
 * each line below.
 *
 * The seed data no longer has these entries, but re-seeding never removes a row
 * (every write is an upsert), so the database needs this migration. Rows are
 * deactivated, not deleted: every Jesus read filters on `is_active`, so they
 * disappear from every list, count and search. Translations, explanations and
 * passages hanging off them stay, so `down` can bring them back.
 *
 * An event is only deactivated when it has no other active facet left. Each
 * of these entries was projected as its own single-facet event (none has a
 * harmony key), but the extraction pipeline can add facets to an event, and
 * one that gained real content should not vanish with the duplicate.
 */
const DUPLICATE_SLUGS = [
  "you-must-be-born-again", // nicodemus
  "living-water", // the-samaritan-woman
  "do-you-want-to-be-healed", // healing-at-bethesda
  "the-widow-of-nain", // raising-the-widows-son-at-nain
  "do-you-believe-that-i-am-able", // healing-two-blind-men
  "let-your-light-shine", // salt-and-light
  "give-to-the-one-who-asks", // teaching-on-retaliation
  "which-proved-to-be-a-neighbour", // parable-of-the-good-samaritan
  "where-are-the-nine", // cleansing-ten-lepers
  "to-seek-and-save-the-lost", // zacchaeus
  "go-and-sin-no-more", // forgiving-the-woman-caught-in-adultery
  "the-good-shepherd-discourse", // parable-of-the-good-shepherd
  "abide-in-me", // i-am-the-true-vine
  "parable-of-the-vine-and-branches", // i-am-the-true-vine
  "woman-why-are-you-weeping", // mary-magdalene-at-the-tomb
  "do-you-love-me", // restoring-peter
  "feed-my-sheep", // restoring-peter
  "all-authority-has-been-given-to-me", // make-disciples-of-all-nations
];

export async function up(db: Kysely<Database>): Promise<void> {
  const slugs = sql.join(DUPLICATE_SLUGS.map((s) => sql.lit(s)));

  await sql`
    UPDATE jesus_entries
       SET is_active = false, updated_at = now()
     WHERE slug IN (${slugs}) AND is_active = true
  `.execute(db);

  await sql`
    UPDATE jesus_facets
       SET is_active = false, updated_at = now()
     WHERE slug IN (${slugs}) AND is_active = true
  `.execute(db);

  await sql`
    UPDATE jesus_events e
       SET is_active = false, updated_at = now()
     WHERE e.slug IN (${slugs})
       AND e.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM jesus_facets f
          WHERE f.event_id = e.event_id
            AND f.is_active = true
       )
  `.execute(db);

  // The Sermon on the Mount study listed "let-your-light-shine" by hand.
  await sql`
    DELETE FROM jesus_collection_entries ce
     USING jesus_entries en
     WHERE ce.entry_id = en.entry_id
       AND en.slug IN (${slugs})
  `.execute(db);
}

/**
 * Reactivates the rows. The study membership is not restored here; re-seeding
 * an older corpus that still lists the entry puts it back.
 */
export async function down(db: Kysely<Database>): Promise<void> {
  const slugs = sql.join(DUPLICATE_SLUGS.map((s) => sql.lit(s)));
  for (const table of ["jesus_entries", "jesus_facets", "jesus_events"]) {
    await sql`
      UPDATE ${sql.table(table)}
         SET is_active = true, updated_at = now()
       WHERE slug IN (${slugs})
    `.execute(db);
  }
}
