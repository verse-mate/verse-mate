import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible search (GET /bible/search): phrase and word search over verse text,
 * ranked so that well-known verses come first.
 *
 * verse_search — one row per verse, holding two search vectors:
 *   words  every word, lower-cased and accent-free, no stemming and no
 *          stop words dropped. Answers exact-phrase queries
 *          (`east <-> and <-> west`), so "east and west" never matches
 *          "east to west" or "beast and western".
 *   stems  the same text through the version language's stemmer
 *          ("loving" finds "love"). Tagalog and Ukrainian have no stemmer in
 *          Postgres and fall back to the `words` treatment.
 *   Both strip accents through the `unaccent` dictionary inside custom text
 *   search configurations (verse_search_*), so "Jesús" matches "Jesus" and
 *   ts_headline can bold the original, accented text. unaccent leaves
 *   Devanagari vowel signs and Ukrainian ї/й/є alone.
 *
 *   It is a side table rather than columns on `verses` so this migration
 *   never rewrites or exclusively locks `verses`: Kysely runs migrations in
 *   one transaction at container boot, and an ALTER TABLE on verses would
 *   hold its lock (blocking every chapter read) until the backfill and index
 *   builds commit. Here verses only takes the CREATE TRIGGER lock, which
 *   blocks writes (none happen at deploy) but not reads.
 *
 *   A row trigger on verses keeps it in sync with every write path (seed,
 *   ingest-versions, manual fixes), not just the ingest script.
 *
 * popular_verses — a hand-curated list of the verses people search for most,
 *   with a weight. Seeded below; editable later without a deploy.
 *
 * verse_popularity — materialized view combining popular_verses, the curated
 *   daily verses and how many users highlighted each verse. Refreshed
 *   hourly by the verse-popularity worker; the search ranks by it.
 */

const LANGUAGE_CONFIGS: { config: string; base: string; stem: string }[] = [
  { config: "verse_search_english", base: "english", stem: "english_stem" },
  { config: "verse_search_german", base: "german", stem: "german_stem" },
  { config: "verse_search_french", base: "french", stem: "french_stem" },
  {
    config: "verse_search_portuguese",
    base: "portuguese",
    stem: "portuguese_stem",
  },
  { config: "verse_search_italian", base: "italian", stem: "italian_stem" },
  { config: "verse_search_russian", base: "russian", stem: "russian_stem" },
  { config: "verse_search_spanish", base: "spanish", stem: "spanish_stem" },
  { config: "verse_search_romanian", base: "romanian", stem: "romanian_stem" },
  { config: "verse_search_hindi", base: "hindi", stem: "hindi_stem" },
];

/**
 * [book_id, chapter, verse_start, verse_end, weight 0..1]. Book ids follow
 * books.book_id (1 = Genesis … 66 = Revelation).
 */
const POPULAR_VERSES: [number, number, number, number, number][] = [
  [43, 3, 16, 16, 1.0], // John 3:16
  [24, 29, 11, 11, 1.0], // Jeremiah 29:11
  [50, 4, 13, 13, 1.0], // Philippians 4:13
  [45, 8, 28, 28, 1.0], // Romans 8:28
  [20, 3, 5, 6, 1.0], // Proverbs 3:5-6
  [19, 23, 1, 6, 1.0], // Psalm 23
  [23, 40, 31, 31, 0.9], // Isaiah 40:31
  [6, 1, 9, 9, 0.9], // Joshua 1:9
  [23, 41, 10, 10, 0.9], // Isaiah 41:10
  [40, 11, 28, 30, 0.9], // Matthew 11:28-30
  [50, 4, 6, 7, 0.9], // Philippians 4:6-7
  [46, 13, 4, 8, 0.9], // 1 Corinthians 13:4-8
  [46, 13, 13, 13, 0.8], // 1 Corinthians 13:13
  [1, 1, 1, 1, 0.9], // Genesis 1:1
  [43, 1, 1, 1, 0.9], // John 1:1
  [43, 14, 6, 6, 0.9], // John 14:6
  [45, 3, 23, 23, 0.8], // Romans 3:23
  [45, 6, 23, 23, 0.8], // Romans 6:23
  [45, 5, 8, 8, 0.8], // Romans 5:8
  [45, 10, 9, 10, 0.8], // Romans 10:9-10
  [45, 12, 1, 2, 0.8], // Romans 12:1-2
  [45, 8, 38, 39, 0.8], // Romans 8:38-39
  [45, 15, 13, 13, 0.7], // Romans 15:13
  [49, 2, 8, 9, 0.9], // Ephesians 2:8-9
  [49, 6, 10, 18, 0.6], // Ephesians 6:10-18
  [48, 5, 22, 23, 0.8], // Galatians 5:22-23
  [48, 2, 20, 20, 0.8], // Galatians 2:20
  [58, 11, 1, 1, 0.8], // Hebrews 11:1
  [58, 11, 6, 6, 0.6], // Hebrews 11:6
  [58, 12, 1, 2, 0.6], // Hebrews 12:1-2
  [58, 4, 12, 12, 0.7], // Hebrews 4:12
  [58, 13, 8, 8, 0.6], // Hebrews 13:8
  [55, 3, 16, 17, 0.8], // 2 Timothy 3:16-17
  [55, 1, 7, 7, 0.7], // 2 Timothy 1:7
  [62, 1, 9, 9, 0.8], // 1 John 1:9
  [62, 4, 8, 8, 0.8], // 1 John 4:8
  [62, 4, 18, 19, 0.6], // 1 John 4:18-19
  [47, 5, 17, 17, 0.8], // 2 Corinthians 5:17
  [47, 12, 9, 9, 0.7], // 2 Corinthians 12:9
  [47, 4, 16, 18, 0.6], // 2 Corinthians 4:16-18
  [40, 6, 9, 13, 0.9], // The Lord's Prayer, Matthew 6:9-13
  [40, 6, 33, 34, 0.8], // Matthew 6:33-34
  [40, 5, 3, 12, 0.8], // The Beatitudes, Matthew 5:3-12
  [40, 5, 14, 16, 0.7], // Matthew 5:14-16
  [40, 28, 19, 20, 0.8], // The Great Commission, Matthew 28:19-20
  [40, 22, 37, 39, 0.8], // The greatest commandment, Matthew 22:37-39
  [40, 7, 7, 8, 0.7], // Matthew 7:7-8
  [40, 7, 12, 12, 0.6], // Matthew 7:12
  [40, 19, 26, 26, 0.6], // Matthew 19:26
  [42, 1, 37, 37, 0.6], // Luke 1:37
  [42, 2, 10, 11, 0.6], // Luke 2:10-11
  [41, 10, 45, 45, 0.5], // Mark 10:45
  [43, 10, 10, 10, 0.7], // John 10:10
  [43, 11, 25, 25, 0.6], // John 11:25
  [43, 11, 35, 35, 0.6], // John 11:35
  [43, 13, 34, 35, 0.6], // John 13:34-35
  [43, 14, 1, 3, 0.6], // John 14:1-3
  [43, 14, 27, 27, 0.7], // John 14:27
  [43, 15, 5, 5, 0.6], // John 15:5
  [43, 15, 13, 13, 0.6], // John 15:13
  [43, 16, 33, 33, 0.7], // John 16:33
  [43, 8, 32, 32, 0.6], // John 8:32
  [44, 1, 8, 8, 0.6], // Acts 1:8
  [44, 2, 38, 38, 0.5], // Acts 2:38
  [59, 1, 2, 4, 0.6], // James 1:2-4
  [59, 1, 5, 5, 0.6], // James 1:5
  [59, 2, 17, 17, 0.5], // James 2:17
  [60, 5, 7, 7, 0.7], // 1 Peter 5:7
  [52, 5, 16, 18, 0.6], // 1 Thessalonians 5:16-18
  [51, 3, 23, 23, 0.6], // Colossians 3:23
  [66, 21, 4, 4, 0.6], // Revelation 21:4
  [66, 3, 20, 20, 0.6], // Revelation 3:20
  [1, 1, 27, 27, 0.6], // Genesis 1:27
  [1, 50, 20, 20, 0.5], // Genesis 50:20
  [2, 14, 14, 14, 0.5], // Exodus 14:14
  [2, 20, 3, 17, 0.6], // The Ten Commandments, Exodus 20:3-17
  [4, 6, 24, 26, 0.6], // The Aaronic blessing, Numbers 6:24-26
  [5, 31, 6, 6, 0.6], // Deuteronomy 31:6
  [5, 6, 4, 5, 0.6], // Deuteronomy 6:4-5
  [6, 24, 15, 15, 0.6], // Joshua 24:15
  [8, 1, 16, 16, 0.5], // Ruth 1:16
  [14, 7, 14, 14, 0.6], // 2 Chronicles 7:14
  [16, 8, 10, 10, 0.5], // Nehemiah 8:10
  [17, 4, 14, 14, 0.5], // Esther 4:14
  [18, 19, 25, 25, 0.4], // Job 19:25
  [19, 1, 1, 3, 0.6], // Psalm 1:1-3
  [19, 19, 14, 14, 0.5], // Psalm 19:14
  [19, 27, 1, 1, 0.6], // Psalm 27:1
  [19, 34, 8, 8, 0.5], // Psalm 34:8
  [19, 37, 4, 4, 0.7], // Psalm 37:4
  [19, 46, 1, 1, 0.7], // Psalm 46:1
  [19, 46, 10, 10, 0.8], // Psalm 46:10
  [19, 51, 10, 10, 0.6], // Psalm 51:10
  [19, 91, 1, 2, 0.6], // Psalm 91:1-2
  [19, 91, 11, 11, 0.5], // Psalm 91:11
  [19, 103, 12, 12, 0.5], // Psalm 103:12
  [19, 118, 24, 24, 0.6], // Psalm 118:24
  [19, 119, 105, 105, 0.7], // Psalm 119:105
  [19, 121, 1, 2, 0.6], // Psalm 121:1-2
  [19, 139, 13, 14, 0.6], // Psalm 139:13-14
  [19, 147, 3, 3, 0.4], // Psalm 147:3
  [20, 16, 3, 3, 0.5], // Proverbs 16:3
  [20, 18, 10, 10, 0.4], // Proverbs 18:10
  [20, 22, 6, 6, 0.5], // Proverbs 22:6
  [20, 4, 23, 23, 0.4], // Proverbs 4:23
  [21, 3, 1, 8, 0.6], // Ecclesiastes 3:1-8
  [23, 9, 6, 6, 0.7], // Isaiah 9:6
  [23, 53, 5, 5, 0.8], // Isaiah 53:5
  [23, 40, 8, 8, 0.5], // Isaiah 40:8
  [23, 43, 2, 2, 0.5], // Isaiah 43:2
  [23, 26, 3, 3, 0.5], // Isaiah 26:3
  [23, 55, 8, 9, 0.5], // Isaiah 55:8-9
  [25, 3, 22, 23, 0.6], // Lamentations 3:22-23
  [26, 36, 26, 26, 0.4], // Ezekiel 36:26
  [33, 6, 8, 8, 0.6], // Micah 6:8
  [36, 3, 17, 17, 0.6], // Zephaniah 3:17
];

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS unaccent`.execute(db);

  // Text search configurations: the stock parser and stemmer, with unaccent
  // run first on every word that can carry an accent.
  await sql`CREATE TEXT SEARCH CONFIGURATION verse_search_simple (COPY = simple)`.execute(
    db,
  );
  await sql`ALTER TEXT SEARCH CONFIGURATION verse_search_simple
    ALTER MAPPING FOR word, hword, hword_part WITH unaccent, simple`.execute(
    db,
  );
  for (const { config, base, stem } of LANGUAGE_CONFIGS) {
    await sql`CREATE TEXT SEARCH CONFIGURATION ${sql.raw(config)} (COPY = ${sql.raw(base)})`.execute(
      db,
    );
    await sql`ALTER TEXT SEARCH CONFIGURATION ${sql.raw(config)}
      ALTER MAPPING FOR word, hword, hword_part WITH unaccent, ${sql.raw(stem)}`.execute(
      db,
    );
  }

  // Version language → stemming configuration. "en-US" (NASB1995) → english.
  await sql`
    CREATE FUNCTION verse_search_config(language_code text) RETURNS regconfig
    LANGUAGE sql STABLE PARALLEL SAFE AS $$
      SELECT (CASE lower(split_part(language_code, '-', 1))
        WHEN 'en' THEN 'verse_search_english'
        WHEN 'de' THEN 'verse_search_german'
        WHEN 'fr' THEN 'verse_search_french'
        WHEN 'pt' THEN 'verse_search_portuguese'
        WHEN 'it' THEN 'verse_search_italian'
        WHEN 'ru' THEN 'verse_search_russian'
        WHEN 'es' THEN 'verse_search_spanish'
        WHEN 'ro' THEN 'verse_search_romanian'
        WHEN 'hi' THEN 'verse_search_hindi'
        ELSE 'verse_search_simple'
      END)::regconfig
    $$`.execute(db);

  // Keys and indexes are added after the backfill: building them in bulk is
  // several times faster than checking 370k rows one by one on insert.
  await sql`
    CREATE TABLE verse_search (
      verse_id integer NOT NULL,
      version_id uuid NOT NULL,
      book_id integer NOT NULL,
      chapter_number integer NOT NULL,
      verse_number integer NOT NULL,
      words tsvector NOT NULL,
      stems tsvector NOT NULL
    )`.execute(db);

  await sql`
    CREATE FUNCTION verse_search_sync() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO verse_search
        (verse_id, version_id, book_id, chapter_number, verse_number, words, stems)
      SELECT NEW.verse_id, NEW.version_id, c.book_id, c.chapter_number,
             NEW.verse_number,
             to_tsvector('verse_search_simple', NEW.text),
             to_tsvector(verse_search_config(bv.language_code), NEW.text)
      FROM chapters c
      JOIN bible_versions bv ON bv.id = NEW.version_id
      WHERE c.chapter_id = NEW.chapter_id
      ON CONFLICT (verse_id) DO UPDATE SET
        version_id = EXCLUDED.version_id,
        book_id = EXCLUDED.book_id,
        chapter_number = EXCLUDED.chapter_number,
        verse_number = EXCLUDED.verse_number,
        words = EXCLUDED.words,
        stems = EXCLUDED.stems;
      RETURN NULL;
    END
    $$`.execute(db);

  // Created before the backfill, inside the same transaction: the trigger's
  // lock stops any verse write from slipping between backfill and commit.
  await sql`
    CREATE TRIGGER verse_search_sync
    AFTER INSERT OR UPDATE OF text, chapter_id, verse_number, version_id
    ON verses
    FOR EACH ROW EXECUTE FUNCTION verse_search_sync()`.execute(db);

  console.log("Filling verse_search…");
  await sql`
    INSERT INTO verse_search
      (verse_id, version_id, book_id, chapter_number, verse_number, words, stems)
    SELECT v.verse_id, v.version_id, c.book_id, c.chapter_number, v.verse_number,
           to_tsvector('verse_search_simple', v.text),
           to_tsvector(verse_search_config(bv.language_code), v.text)
    FROM verses v
    JOIN chapters c ON c.chapter_id = v.chapter_id
    JOIN bible_versions bv ON bv.id = v.version_id`.execute(db);

  // Plain (not CONCURRENTLY) builds: CONCURRENTLY can't run inside the
  // migration transaction, and these only lock the new table.
  await sql`ALTER TABLE verse_search ADD PRIMARY KEY (verse_id)`.execute(db);
  await sql`ALTER TABLE verse_search ADD FOREIGN KEY (verse_id)
    REFERENCES verses (verse_id) ON DELETE CASCADE`.execute(db);
  await sql`CREATE INDEX verse_search_words_idx ON verse_search USING gin (words)`.execute(
    db,
  );
  await sql`CREATE INDEX verse_search_stems_idx ON verse_search USING gin (stems)`.execute(
    db,
  );
  await sql`CREATE INDEX verse_search_order_idx
    ON verse_search (version_id, book_id, chapter_number, verse_number)`.execute(
    db,
  );

  // No FK to books: a fresh database (CI, `make install`) runs migrations
  // before the seed creates the books.
  await sql`
    CREATE TABLE popular_verses (
      book_id integer NOT NULL CHECK (book_id BETWEEN 1 AND 66),
      chapter_number integer NOT NULL,
      verse_start integer NOT NULL,
      verse_end integer NOT NULL,
      weight real NOT NULL CHECK (weight > 0 AND weight <= 1),
      PRIMARY KEY (book_id, chapter_number, verse_start),
      CHECK (verse_end >= verse_start)
    )`.execute(db);

  await sql`
    INSERT INTO popular_verses
      (book_id, chapter_number, verse_start, verse_end, weight)
    VALUES ${sql.join(POPULAR_VERSES.map((row) => sql`(${sql.join(row)})`))}`.execute(
    db,
  );

  // Score per verse, roughly 0..2:
  //   curated weight (0..1)
  // + 0.5 if it is in the curated daily-verse pool
  // + 0.15 · ln(1 + users who highlighted it), so a handful of highlights
  //   nudges a verse up without outranking the curated list.
  await sql`
    CREATE MATERIALIZED VIEW verse_popularity AS
    WITH signals AS (
      SELECT p.book_id, p.chapter_number, v AS verse_number,
             p.weight::float8 AS score
      FROM popular_verses p, generate_series(p.verse_start, p.verse_end) v
      UNION ALL
      SELECT d.book_id, d.chapter_number, v, 0.5
      FROM daily_verses d,
           generate_series(d.verse_start, coalesce(d.verse_end, d.verse_start)) v
      WHERE d.is_active
      UNION ALL
      SELECT h.book_id, h.chapter_number, h.verse_number,
             0.15 * ln(1 + count(DISTINCT h.user_id))
      FROM (
        SELECT book_id, chapter_number, user_id,
               generate_series(start_verse, end_verse) AS verse_number
        FROM verse_highlights
      ) h
      GROUP BY h.book_id, h.chapter_number, h.verse_number
    )
    SELECT book_id, chapter_number, verse_number, sum(score)::real AS score
    FROM signals
    GROUP BY book_id, chapter_number, verse_number`.execute(db);

  // Unique index: required by REFRESH MATERIALIZED VIEW CONCURRENTLY.
  await sql`CREATE UNIQUE INDEX verse_popularity_pkey
    ON verse_popularity (book_id, chapter_number, verse_number)`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP MATERIALIZED VIEW IF EXISTS verse_popularity`.execute(db);
  await sql`DROP TABLE IF EXISTS popular_verses`.execute(db);
  await sql`DROP TRIGGER IF EXISTS verse_search_sync ON verses`.execute(db);
  await sql`DROP FUNCTION IF EXISTS verse_search_sync()`.execute(db);
  await sql`DROP TABLE IF EXISTS verse_search`.execute(db);
  await sql`DROP FUNCTION IF EXISTS verse_search_config(text)`.execute(db);
  for (const { config } of LANGUAGE_CONFIGS) {
    await sql`DROP TEXT SEARCH CONFIGURATION IF EXISTS ${sql.raw(config)}`.execute(
      db,
    );
  }
  await sql`DROP TEXT SEARCH CONFIGURATION IF EXISTS verse_search_simple`.execute(
    db,
  );
}
