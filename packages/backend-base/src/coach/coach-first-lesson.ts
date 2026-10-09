import { sql } from "kysely";

import { rescoreReport } from "./coach-review.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import { FIRST_LESSON_RATIONALE, MEMORY_REINFORCEMENT } from "./rubric";

const SINGLE_BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "Jude",
  "Revelation",
];

const NUMBERED_BOOKS: Array<[string, number]> = [
  ["Samuel", 2],
  ["Kings", 2],
  ["Chronicles", 2],
  ["Corinthians", 2],
  ["Thessalonians", 2],
  ["Timothy", 2],
  ["Peter", 2],
  ["John", 3],
];

const ALIASES: Record<string, string> = {
  Psalm: "Psalms",
  "Song of Songs": "Song of Solomon",
};

const ORDINAL = "(?:([123])|(First|Second|Third))";
const ORDINAL_VALUE: Record<string, number> = { First: 1, Second: 2, Third: 3 };

const NUMBERED_PATTERN = new RegExp(
  `\\b${ORDINAL}\\s*(${NUMBERED_BOOKS.map(([name]) => name).join("|")})\\b`,
  "g",
);

const SINGLE_PATTERN = new RegExp(
  `(?<!(?:[123]|First|Second|Third)\\s*)\\b(${[
    ...SINGLE_BOOKS,
    ...Object.keys(ALIASES),
  ]
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "g",
);

export function booksNamedIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(NUMBERED_PATTERN)) {
    const n = match[1] ? Number(match[1]) : ORDINAL_VALUE[match[2]];
    const max =
      NUMBERED_BOOKS.find(([name]) => name === match[3])?.[1] ?? Number.NaN;
    if (n <= max) found.add(`${n} ${match[3]}`);
  }
  for (const match of text.matchAll(SINGLE_PATTERN)) {
    found.add(ALIASES[match[1]] ?? match[1]);
  }
  return found;
}

export function bookNamedIn(text: string): string | null {
  const found = booksNamedIn(text);
  return found.size === 1 ? [...found][0] : null;
}

export function canonicalBook(book: string | null | undefined): string | null {
  const trimmed = (book ?? "").trim();
  if (!trimmed) return null;
  return bookNamedIn(trimmed) ?? trimmed.toLowerCase();
}

export function isFirstLesson(
  book: string | null | undefined,
  previousBook: string | null | undefined,
): boolean {
  const current = canonicalBook(book);
  const previous = canonicalBook(previousBook);
  if (!current || !previous) return false;
  return current !== previous;
}

export function classDay(sessionDate: string): number {
  return new Date(`${sessionDate.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export function legacyReportBook(summary: unknown): string | null {
  const s = (summary ?? {}) as { session?: unknown; topic?: unknown };
  const session = typeof s.session === "string" ? s.session : "";
  const topic = typeof s.topic === "string" ? s.topic : "";
  const inSession = booksNamedIn(session);
  if (inSession.size > 0)
    return inSession.size === 1 ? [...inSession][0] : null;
  return bookNamedIn(topic);
}

export async function previousSessionBook(
  conn: CoachReportsWriter,
  report: { id: string; coachId: string; sessionDate: string },
): Promise<string | null> {
  const rows = await conn
    .selectFrom("coach_reports")
    .select(["passage_book", "source_session_id", "summary"])
    .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
    .where("coach_id", "=", report.coachId)
    .where("id", "!=", report.id)
    .where("session_date", "<", sql<Date>`${report.sessionDate}::date`)
    .where(
      sql`EXTRACT(DOW FROM session_date)`,
      "=",
      sql`EXTRACT(DOW FROM ${report.sessionDate}::date)`,
    )
    .orderBy("session_date", "desc")
    .limit(5)
    .execute();
  const latest = rows[0]?.date;
  for (const row of rows.filter((r) => r.date === latest)) {
    const book = row.passage_book?.trim()
      ? row.passage_book
      : row.source_session_id.startsWith("legacy:")
        ? legacyReportBook(row.summary)
        : null;
    if (book) return book;
  }
  return null;
}

export async function applyFirstLessonDetection(
  trx: CoachReportsWriter,
  reportId: string,
  book: string | null | undefined,
): Promise<boolean> {
  if (!book?.trim()) return false;
  const report = await trx
    .selectFrom("coach_reports")
    .select(["id", "coach_id", "first_lesson", "first_lesson_source"])
    .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
    .where("id", "=", reportId)
    .forUpdate()
    .executeTakeFirst();
  if (!report) return false;

  await trx
    .updateTable("coach_reports")
    .set({ passage_book: book.trim() })
    .where("id", "=", reportId)
    .execute();
  if (report.first_lesson_source === "admin") return report.first_lesson;
  const memory = await trx
    .selectFrom("coach_report_dimension_scores")
    .select("provenance")
    .where("report_id", "=", reportId)
    .where("dimension_n", "=", MEMORY_REINFORCEMENT)
    .executeTakeFirst();
  if (memory?.provenance === "human") return report.first_lesson;

  const first = isFirstLesson(
    book,
    await previousSessionBook(trx, {
      id: report.id,
      coachId: report.coach_id,
      sessionDate: report.date,
    }),
  );
  await trx
    .updateTable("coach_reports")
    .set({
      first_lesson: first,
      first_lesson_source: first ? "detected" : null,
    })
    .where("id", "=", reportId)
    .execute();
  if (!first) return false;

  await trx
    .updateTable("coach_report_dimension_scores")
    .set({
      score: null,
      machine_score: null,
      rationale: FIRST_LESSON_RATIONALE,
      updated_at: sql`NOW()`,
    })
    .where("report_id", "=", reportId)
    .where("dimension_n", "=", MEMORY_REINFORCEMENT)
    .where("provenance", "=", "machine")
    .execute();
  await rescoreReport(trx, reportId);
  return true;
}
