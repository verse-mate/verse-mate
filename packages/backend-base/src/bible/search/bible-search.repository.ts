import type Database from "database/src/models/Database";
import { type Transaction, sql } from "kysely";
import type { db } from "../../shared/shared.plugin";
import { HIGHLIGHT_START, HIGHLIGHT_STOP } from "./search-query";

export interface SearchFilters {
  versionId: string;
  languageCode: string;
  testament?: "OT" | "NT";
  bookId?: number;
}

/**
 * Book names are the canonical English ones (books.name), as everywhere else
 * in the reader UI; version_book_names holds full USFM titles ("I. СОБОРНЕ
 * ПОСЛАННЄ СЬВ. АПОСТОЛА ЙОАНА…") that only the reference parser uses.
 */
export interface VerseMatchRow {
  verse_id: number;
  book_id: number;
  book_name: string;
  chapter_number: number;
  verse_number: number;
  text: string;
  is_exact: boolean;
  headline: string;
}

export interface BookCountRow {
  book_id: number;
  book_name: string;
  testament: "OT" | "NT";
  total: number;
  exact: number;
}

/** A search that runs longer than this is cancelled by Postgres. */
const STATEMENT_TIMEOUT_MS = 3000;

const HEADLINE_OPTIONS = `HighlightAll=true, StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_STOP}`;

export class BibleSearchRepository {
  constructor(private readonly db: db) {}

  async findVersion(versionKey: string) {
    return this.db
      .getOrCreateConnection()
      .selectFrom("bible_versions")
      .select(["id", "language_code"])
      .where("version_key", "=", versionKey)
      .executeTakeFirst();
  }

  /**
   * One page of matches, exact-phrase matches first.
   *
   * Exact matches are ordered by popularity, all-words matches by text rank
   * plus popularity, and Bible order breaks every tie, so OFFSET paging is
   * stable. A verse that matches the exact phrase appears only in the exact
   * group. ts_headline is slow, so it runs only on the page's rows.
   */
  async searchPage(
    phrase: string,
    allWords: string,
    filters: SearchFilters,
    limit: number,
    offset: number,
  ): Promise<VerseMatchRow[]> {
    return this.withTimeout(async (trx) => {
      const { rows } = await sql<VerseMatchRow>`
        WITH page AS (
          SELECT m.verse_id, m.book_id, m.chapter_number, m.verse_number,
                 m.is_exact,
                 CASE WHEN m.is_exact THEN coalesce(p.score, 0)
                      ELSE m.rank + coalesce(p.score, 0) END AS sort_score
          FROM (
            SELECT s.verse_id, s.book_id, s.chapter_number, s.verse_number,
                   s.words @@ ${exactQuery(phrase)} AS is_exact,
                   ts_rank(s.stems, ${stemsQuery(allWords, filters)}, 1) AS rank
            FROM verse_search s
            WHERE ${matchCondition(phrase, allWords, filters)}
          ) m
          LEFT JOIN verse_popularity p
            ON p.book_id = m.book_id
           AND p.chapter_number = m.chapter_number
           AND p.verse_number = m.verse_number
          ORDER BY m.is_exact DESC, sort_score DESC,
                   m.book_id, m.chapter_number, m.verse_number
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT page.verse_id, page.book_id, page.chapter_number,
               page.verse_number, page.is_exact, v.text,
               b.name AS book_name,
               CASE WHEN page.is_exact
                 THEN ts_headline('verse_search_simple', v.text,
                                  ${exactQuery(phrase)}, ${HEADLINE_OPTIONS})
                 ELSE ts_headline(verse_search_config(${filters.languageCode}),
                                  v.text, ${stemsQuery(allWords, filters)},
                                  ${HEADLINE_OPTIONS})
               END AS headline
        FROM page
        JOIN verses v ON v.verse_id = page.verse_id
        JOIN books b ON b.book_id = page.book_id
        ORDER BY page.is_exact DESC, page.sort_score DESC,
                 page.book_id, page.chapter_number, page.verse_number
      `.execute(trx);
      return rows;
    });
  }

  /**
   * Match counts per book across the whole Bible (testament and book filters
   * ignored), for the filter chips.
   */
  async countByBook(
    phrase: string,
    allWords: string,
    filters: SearchFilters,
  ): Promise<BookCountRow[]> {
    const unfiltered: SearchFilters = {
      versionId: filters.versionId,
      languageCode: filters.languageCode,
    };
    return this.withTimeout(async (trx) => {
      const { rows } = await sql<BookCountRow>`
        WITH counts AS (
          SELECT s.book_id,
                 count(*)::int AS total,
                 count(*) FILTER (WHERE s.words @@ ${exactQuery(phrase)})::int AS exact
          FROM verse_search s
          WHERE ${matchCondition(phrase, allWords, unfiltered)}
          GROUP BY s.book_id
        )
        SELECT c.book_id, c.total, c.exact, b.testament, b.name AS book_name
        FROM counts c
        JOIN books b ON b.book_id = c.book_id
        ORDER BY c.book_id
      `.execute(trx);
      return rows;
    });
  }

  /** Recomputes verse_popularity from its sources (verse-popularity worker). */
  async refreshPopularity(): Promise<void> {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY verse_popularity`.execute(
      this.db.getOrCreateConnection(),
    );
  }

  private withTimeout<T>(
    run: (trx: Transaction<Database>) => Promise<T>,
  ): Promise<T> {
    return this.db
      .getOrCreateConnection()
      .transaction()
      .execute(async (trx) => {
        // set_config(…, true) is SET LOCAL that takes a bound parameter.
        await sql`SELECT set_config('statement_timeout', ${String(STATEMENT_TIMEOUT_MS)}, true)`.execute(
          trx,
        );
        return run(trx);
      });
  }
}

// The tsquery calls are written inline wherever they're used, not read from a
// CTE, so the planner sees them as constants and can use the GIN indexes.

function exactQuery(phrase: string) {
  return sql`to_tsquery('verse_search_simple', ${phrase})`;
}

function stemsQuery(allWords: string, filters: SearchFilters) {
  return sql`to_tsquery(verse_search_config(${filters.languageCode}), ${allWords})`;
}

function matchCondition(
  phrase: string,
  allWords: string,
  filters: SearchFilters,
) {
  const conditions = [
    sql`s.version_id = ${filters.versionId}`,
    sql`(s.words @@ ${exactQuery(phrase)} OR s.stems @@ ${stemsQuery(allWords, filters)})`,
  ];
  if (filters.testament === "OT") conditions.push(sql`s.book_id <= 39`);
  if (filters.testament === "NT") conditions.push(sql`s.book_id >= 40`);
  if (filters.bookId) conditions.push(sql`s.book_id = ${filters.bookId}`);
  return sql.join(conditions, sql` AND `);
}
