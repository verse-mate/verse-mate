import { NotFoundError } from "../../common/errors";
import type {
  BibleSearchRepository,
  SearchFilters,
} from "./bible-search.repository";
import { highlightRanges, parseSearchQuery } from "./search-query";

export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGE_SIZE = 50;
/**
 * Deep paging past this is never a person reading; capping it stops a
 * crafted cursor from making Postgres sort and skip the whole Bible.
 */
export const SEARCH_MAX_OFFSET = 1000;

export interface BibleSearchParams {
  q: string;
  versionKey: string;
  testament?: "OT" | "NT";
  bookId?: number;
  /** Opaque paging cursor from a previous response (an offset). */
  cursor?: string;
  limit?: number;
}

export interface BibleSearchResult {
  match: "exact" | "words";
  bookId: number;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  /** [start, end) character ranges of `text` to show in bold. */
  highlights: [number, number][];
}

export interface BibleSearchResponse {
  results: BibleSearchResult[];
  nextCursor: string | null;
  /**
   * First page only (null on later pages): match totals and per-book counts
   * across the whole Bible, ignoring the testament/book filters, for the
   * filter chips.
   */
  totals: { exact: number; words: number } | null;
  books:
    | {
        bookId: number;
        name: string;
        testament: "OT" | "NT";
        count: number;
      }[]
    | null;
}

const EMPTY: BibleSearchResponse = {
  results: [],
  nextCursor: null,
  totals: { exact: 0, words: 0 },
  books: [],
};

export class BibleSearchService {
  constructor(private readonly repository: BibleSearchRepository) {}

  async search(params: BibleSearchParams): Promise<BibleSearchResponse> {
    const parsed = parseSearchQuery(params.q);
    if (!parsed) return EMPTY;

    const version = await this.repository.findVersion(params.versionKey);
    if (!version) throw new NotFoundError("Invalid bible version");

    const filters: SearchFilters = {
      versionId: version.id,
      languageCode: version.language_code,
      testament: params.testament,
      bookId: params.bookId,
    };
    const limit = Math.min(
      Math.max(params.limit ?? SEARCH_PAGE_SIZE, 1),
      SEARCH_MAX_PAGE_SIZE,
    );
    const offset = decodeCursor(params.cursor);

    const [rows, counts] = await Promise.all([
      // One extra row tells us whether there is a next page.
      this.repository.searchPage(
        parsed.phrase,
        parsed.allWords,
        filters,
        limit + 1,
        offset,
      ),
      offset === 0
        ? this.repository.countByBook(parsed.phrase, parsed.allWords, filters)
        : null,
    ]);

    const page = rows.slice(0, limit);
    return {
      results: page.map((row) => ({
        match: row.is_exact ? "exact" : "words",
        bookId: row.book_id,
        bookName: row.book_name,
        chapter: row.chapter_number,
        verse: row.verse_number,
        text: row.text,
        highlights: highlightRanges(
          row.headline,
          row.text,
          row.is_exact ? parsed : undefined,
        ),
      })),
      nextCursor:
        rows.length > limit && offset + limit <= SEARCH_MAX_OFFSET
          ? String(offset + limit)
          : null,
      totals: counts
        ? {
            exact: counts.reduce((n, c) => n + c.exact, 0),
            words: counts.reduce((n, c) => n + c.total - c.exact, 0),
          }
        : null,
      books: counts
        ? counts.map((c) => ({
            bookId: c.book_id,
            name: c.book_name,
            testament: c.testament,
            count: c.total,
          }))
        : null,
    };
  }

  refreshPopularity() {
    return this.repository.refreshPopularity();
  }
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const offset = Number.parseInt(cursor, 10);
  return Number.isFinite(offset) && offset > 0
    ? Math.min(offset, SEARCH_MAX_OFFSET)
    : 0;
}
