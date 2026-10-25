import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { sql } from "kysely";

import { getTestClient } from "../../shared/test-client";
import Backend from "../bible.plugin";
import type {
  BibleSearchResponse,
  BibleSearchResult,
} from "./bible-search.service";

/**
 * Runs against the seeded test database (NASB1995, `bun db:seed`), so these
 * exercise the real migration: text search configs, the verse_search
 * trigger, the GIN indexes and verse_popularity.
 */
describe("GET /bible/search", () => {
  const plugin = new Elysia().use(Backend);
  // @ts-ignore - Combined plugin types
  const client = getTestClient<typeof plugin>(plugin);
  const conn = () => Backend.store.db.getOrCreateConnection();

  let seeded = false;

  beforeAll(async () => {
    const row = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM verse_search s
      JOIN bible_versions v ON v.id = s.version_id
      WHERE v.version_key = 'NASB1995'`.execute(conn());
    seeded = (row.rows[0]?.n ?? 0) > 0;
  });

  afterAll(() => {
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  const search = async (query: Record<string, unknown>) => {
    // @ts-ignore - looser query values than the route schema, on purpose
    const { data, error, status } = await client.bible.search.get({ query });
    return { data: data as BibleSearchResponse, error, status };
  };

  const ref = (r: BibleSearchResult) => `${r.bookId}:${r.chapter}:${r.verse}`;

  it("puts the exact phrase first and all-words matches after it", async () => {
    if (!seeded) return;
    const { data, error } = await search({ q: "east and west" });
    expect(error).toBeFalsy();
    const exact = data.results.filter((r) => r.match === "exact");
    const words = data.results.filter((r) => r.match === "words");

    expect(exact.map(ref)).toContain("40:8:11"); // Matthew 8:11
    expect(words.map(ref)).toContain("19:103:12"); // Psalm 103:12
    expect(exact.map(ref)).not.toContain("19:103:12");
    // Exact group first, never interleaved.
    const firstWords = data.results.findIndex((r) => r.match === "words");
    expect(
      data.results.slice(firstWords).every((r) => r.match === "words"),
    ).toBe(true);
  });

  it("bolds the phrase, not every occurrence of its words", async () => {
    if (!seeded) return;
    const { data } = await search({ q: "east and west" });
    const matthew = data.results.find((r) => r.bookId === 40);
    const bold = matthew?.highlights.map(([s, e]) => matthew.text.slice(s, e));
    expect(bold).toEqual(["east", "and", "west"]);
  });

  it("matches the unfinished last word as a prefix", async () => {
    if (!seeded) return;
    const { data } = await search({ q: "east and wes" });
    expect(data.results[0].match).toBe("exact");
    expect(data.results.map(ref)).toContain("40:8:11");
  });

  it("matches word endings through the stemmer", async () => {
    if (!seeded) return;
    // NASB John 3:16 has "loved"; "loving" only matches through the stem.
    const { data } = await search({ q: "loving world " });
    expect(data.results.map(ref)).toContain("43:3:16");
  });

  it("ranks well-known verses first", async () => {
    if (!seeded) return;
    const { data } = await search({ q: "god so loved the world" });
    expect(ref(data.results[0])).toBe("43:3:16");
    const { data: shepherd } = await search({ q: "the lord is my shepherd" });
    expect(ref(shepherd.results[0])).toBe("19:23:1");
  });

  it("filters by testament and book, and counts per book unfiltered", async () => {
    if (!seeded) return;
    const all = await search({ q: "shepherd" });
    const nt = await search({ q: "shepherd", testament: "NT" });
    const john = await search({ q: "shepherd", book: 43 });

    expect(nt.data.results.every((r) => r.bookId >= 40)).toBe(true);
    expect(john.data.results.every((r) => r.bookId === 43)).toBe(true);
    // The chips' counts ignore the filters, so they match across requests.
    expect(nt.data.books).toEqual(all.data.books);
    const johnCount = all.data.books?.find((b) => b.bookId === 43);
    expect(johnCount?.count).toBeGreaterThan(0);
  });

  it("pages with a cursor without repeating results", async () => {
    if (!seeded) return;
    const first = await search({ q: "lord", limit: 10 });
    expect(first.data.results).toHaveLength(10);
    expect(first.data.nextCursor).toBe("10");
    const total =
      (first.data.totals?.exact ?? 0) + (first.data.totals?.words ?? 0);
    expect(total).toBeGreaterThan(10);

    const second = await search({ q: "lord", limit: 10, cursor: "10" });
    expect(second.data.totals).toBeNull();
    expect(second.data.books).toBeNull();
    const seen = new Set(first.data.results.map(ref));
    expect(second.data.results.some((r) => seen.has(ref(r)))).toBe(false);
  });

  it("treats tsquery syntax in the input as plain text", async () => {
    const { data, error } = await search({ q: "(east) & and | !west:*" });
    expect(error).toBeFalsy();
    if (seeded) expect(data.results.map(ref)).toContain("40:8:11");
  });

  it("returns an empty result for input with nothing to search", async () => {
    const { data, error } = await search({ q: " !! " });
    expect(error).toBeFalsy();
    expect(data.results).toEqual([]);
  });

  it("returns only exact matches when every word is a stop word", async () => {
    if (!seeded) return;
    const { data, error } = await search({ q: "and the " });
    expect(error).toBeFalsy();
    expect(data.results.every((r) => r.match === "exact")).toBe(true);
  });

  it("404s on an unknown version", async () => {
    const { status } = await search({ q: "love", bible_version: "NOPE" });
    expect(status).toBe(404);
  });

  it("keeps verse_search in sync when a verse's text changes", async () => {
    if (!seeded) return;
    const verse = await sql<{ verse_id: number; text: string }>`
      SELECT v.verse_id, v.text FROM verses v
      JOIN chapters c ON c.chapter_id = v.chapter_id
      JOIN bible_versions bv ON bv.id = v.version_id
      WHERE bv.version_key = 'NASB1995' AND c.book_id = 65
        AND c.chapter_number = 1 AND v.verse_number = 25`.execute(conn());
    const { verse_id, text } = verse.rows[0];
    try {
      await sql`UPDATE verses SET text = ${`${text} zyxwvutsearchmarker`}
        WHERE verse_id = ${verse_id}`.execute(conn());
      const { data } = await search({ q: "zyxwvutsearchmarker " });
      expect(data.results.map(ref)).toEqual(["65:1:25"]);
    } finally {
      await sql`UPDATE verses SET text = ${text} WHERE verse_id = ${verse_id}`.execute(
        conn(),
      );
    }
    const { data } = await search({ q: "zyxwvutsearchmarker " });
    expect(data.results).toEqual([]);
  });
});
