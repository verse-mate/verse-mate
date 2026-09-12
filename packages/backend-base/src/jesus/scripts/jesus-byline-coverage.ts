/**
 * Does every verse the Jesus feature prints carry a line-by-line explanation?
 *
 *   bun run jesus:byline                  # the report
 *   bun run jesus:byline -- --gaps        # only the passages with gaps
 *   bun run jesus:byline -- --json        # machine-readable, for CI or a fill run
 *   bun run jesus:byline -- --strict      # exit 1 when anything is missing
 *
 * The Jesus screens don't generate By-Line content of their own. The client
 * takes the chapter commentary the Bible side already serves and narrows it to
 * the verses an event spans, so an event is only as explained as the chapters
 * behind it — and a Gospel account whose chapter was never generated shows a
 * passage with nothing under it.
 *
 * "The By-Line tab is empty for some events" was true and nobody could act on
 * it, because nothing said which ones. This prints the list, per passage and
 * per verse, and ends with the exact chapters to regenerate.
 *
 * It reports and does not write. Filling the gaps means generating chapter
 * bylines, which is the admin batch operation's job (`generateBookBatchByName`
 * with `explanationTypes: ["byline"]` and the `chapters` this prints) — one
 * submission, half price, and resumable, none of which a script issuing
 * requests one at a time would be.
 */
import { db } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { BibleRepository } from "../../bible/repository/bible.repository";
import {
  type JesusPassageSpan,
  type PassageBylineCoverage,
  assessPassageByline,
  chaptersToFill,
  summarizeBylineCoverage,
} from "../utils/byline-coverage";

const DEFAULT_LANGUAGE = "en-US";

const MARK = { covered: "·", partial: "◐", ungenerated: "▽" } as const;

/** Every passage the event graph and the legacy entries point at. */
async function collectSpans(
  conn: ReturnType<typeof db.getOrCreateConnection>,
): Promise<JesusPassageSpan[]> {
  const events = await conn
    .selectFrom("jesus_event_passages as p")
    .innerJoin("jesus_events as e", "e.event_id", "p.event_id")
    .innerJoin("books as b", "b.book_id", "p.book_id")
    .where("e.is_active", "=", true)
    .select([
      "e.slug as slug",
      "e.title as title",
      "p.book_id as book_id",
      "b.name as book_name",
      "p.chapter as chapter",
      "p.verse_start as verse_start",
      "p.verse_end as verse_end",
    ])
    .orderBy("e.sequence")
    .orderBy("p.canonical_order")
    .execute();

  const entries = await conn
    .selectFrom("jesus_entry_references as r")
    .innerJoin("jesus_entries as t", "t.entry_id", "r.entry_id")
    .innerJoin("books as b", "b.book_id", "r.book_id")
    .where("t.is_active", "=", true)
    .select([
      "t.slug as slug",
      "t.title as title",
      "r.book_id as book_id",
      "b.name as book_name",
      "r.chapter as chapter",
      "r.verse_start as verse_start",
      "r.verse_end as verse_end",
    ])
    .execute();

  const toSpan =
    (source: "event" | "entry") =>
    (row: (typeof events)[number]): JesusPassageSpan => ({
      source,
      slug: row.slug,
      title: row.title,
      bookId: row.book_id,
      bookName: row.book_name,
      chapter: row.chapter,
      verseStart: row.verse_start,
      verseEnd: row.verse_end,
    });

  return [...events.map(toSpan("event")), ...entries.map(toSpan("entry"))];
}

/** Verses per chapter, for the books the Jesus corpus touches. */
async function verseCounts(
  conn: ReturnType<typeof db.getOrCreateConnection>,
  bookIds: number[],
): Promise<Map<string, number>> {
  if (bookIds.length === 0) return new Map();

  const version = await conn
    .selectFrom("bible_versions")
    .select(["id"])
    .where("is_active", "=", true)
    .executeTakeFirst();

  if (!version) throw new Error("No active bible version found");

  const rows = await conn
    .selectFrom("verses as v")
    .innerJoin("chapters as c", "c.chapter_id", "v.chapter_id")
    .where("c.book_id", "in", bookIds)
    .where("v.version_id", "=", version.id)
    .select((eb) => [
      "c.book_id as book_id",
      "c.chapter_number as chapter_number",
      eb.fn.countAll<string>().as("verses"),
    ])
    .groupBy(["c.book_id", "c.chapter_number"])
    .execute();

  return new Map(
    rows.map((r) => [`${r.book_id}:${r.chapter_number}`, Number(r.verses)]),
  );
}

function renderPassages(rows: PassageBylineCoverage[], gapsOnly: boolean) {
  const shown = gapsOnly ? rows.filter((r) => r.status !== "covered") : rows;
  if (shown.length === 0) {
    console.log("\n  Every passage is explained.\n");
    return;
  }

  console.log(
    `\n  ${"".padEnd(2)}${"passage".padEnd(22)}${"verses".padStart(7)}  what is missing`,
  );

  let lastSlug = "";
  for (const row of shown) {
    if (row.passage.slug !== lastSlug) {
      lastSlug = row.passage.slug;
      console.log(`\n  ${row.passage.title}`);
    }
    const note =
      row.status === "covered"
        ? "explained"
        : row.status === "ungenerated"
          ? `no byline for ${row.passage.bookName} ${row.passage.chapter}`
          : `no summary for ${row.passage.bookName} ${row.passage.chapter}:${row.missing.join(", ")}`;
    console.log(
      `  ${MARK[row.status]} ${row.display.padEnd(22)}${String(row.verses.length).padStart(7)}  ${note}`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const gapsOnly = args.includes("--gaps");
  const strict = args.includes("--strict");
  const language =
    args.find((a) => a.startsWith("--language="))?.split("=")[1] ??
    DEFAULT_LANGUAGE;

  const conn = db.getOrCreateConnection();
  const bible = new BibleRepository(db);

  try {
    const spans = await collectSpans(conn);
    const bookIds = [...new Set(spans.map((s) => s.bookId))];
    const counts = await verseCounts(conn, bookIds);

    // One lookup per chapter, not per passage — several accounts share one.
    // Read through the repository so "which byline is live" is decided by the
    // same query that answers the reader, version and language fallback
    // included, rather than by a second implementation of it here.
    const bylines = new Map<string, string | null>();
    for (const key of new Set(spans.map((s) => `${s.bookId}:${s.chapter}`))) {
      const [bookId, chapter] = key.split(":").map(Number);
      const { explanation } = await bible.getExplanation({
        book_id: bookId,
        chapter_number: chapter,
        language_code: language,
        type: ExplanationTypeEnum.byline,
      });
      bylines.set(key, explanation?.explanation ?? null);
    }

    const rows = spans.map((span) => {
      const key = `${span.bookId}:${span.chapter}`;
      return assessPassageByline(
        span,
        counts.get(key) ?? 0,
        bylines.get(key) ?? null,
      );
    });

    const summary = summarizeBylineCoverage(rows);
    const fill = chaptersToFill(rows);

    if (asJson) {
      console.log(
        JSON.stringify(
          {
            language,
            summary,
            fill,
            gaps: rows
              .filter((r) => r.status !== "covered")
              .map((r) => ({
                source: r.passage.source,
                slug: r.passage.slug,
                passage: r.display,
                status: r.status,
                missing: r.missing,
              })),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `\nLine-by-line coverage of the Jesus corpus (${language})\n` +
          `\n  ${summary.passages} passages · ${summary.verses} verses` +
          `\n  ${summary.covered} explained · ${summary.partial} part-explained · ${summary.ungenerated} with no chapter byline` +
          `\n  ${summary.versesMissing} verses with no explanation`,
      );

      renderPassages(rows, gapsOnly);

      if (fill.length > 0) {
        console.log("\n  Chapters to generate:\n");
        for (const book of fill) {
          console.log(`    ${book.bookName}: ${book.chapters.join(", ")}`);
        }
        console.log(
          "\n  Fill them from the admin batch operation — book batch, type" +
            "\n  byline, those chapters. Regenerating a part-explained chapter is" +
            "\n  what fills the verses its byline skipped.\n",
        );
      }
    }

    if (strict && summary.versesMissing > 0) process.exitCode = 1;
  } finally {
    await db.closeConnection();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
