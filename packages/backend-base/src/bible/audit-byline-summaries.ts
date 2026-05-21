/**
 * Audit active byline explanations against the VER-120 quality gate
 * (≥ MIN_SUMMARY_SENTENCES per per-verse `### Summary` block).
 *
 * Usage:
 *   cd packages/backend-base && bun run src/bible/audit-byline-summaries.ts [--json]
 *
 * Prerequisites:
 *   - Database reachable via POSTGRES_URL (no OpenAI key needed — this
 *     script is read-only).
 *
 * Output:
 *   - Human-readable summary by default.
 *   - `--json` prints a JSON report suitable for piping into remediation
 *     tooling.
 *
 * The script is read-only and idempotent.
 */

import { db } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import {
  MIN_SUMMARY_SENTENCES,
  countSentences,
  extractVerseSummaries,
} from "../shared/byline-chunking";

type ShortVerseFinding = {
  verseHeading: string;
  sentenceCount: number;
};

type ChapterFinding = {
  chapter_id: number;
  book_name: string;
  chapter_number: number;
  language_code: string;
  explanation_id: number;
  total_verses: number;
  short_verses: ShortVerseFinding[];
};

async function auditByLineSummaries(): Promise<ChapterFinding[]> {
  const connection = db.getOrCreateConnection();

  const rows = await connection
    .selectFrom("explanations")
    .innerJoin("chapters", "chapters.chapter_id", "explanations.chapter_id")
    .innerJoin("books", "books.book_id", "chapters.book_id")
    .where("explanations.type", "=", ExplanationTypeEnum.byline)
    .where("explanations.is_active", "=", true)
    .select([
      "explanations.explanation_id",
      "explanations.chapter_id",
      "explanations.explanation",
      "explanations.language_code",
      "chapters.chapter_number",
      "books.name as book_name",
    ])
    .orderBy("books.book_id", "asc")
    .orderBy("chapters.chapter_number", "asc")
    .orderBy("explanations.language_code", "asc")
    .execute();

  const findings: ChapterFinding[] = [];

  for (const row of rows) {
    const summaries = extractVerseSummaries(row.explanation);
    if (summaries.length === 0) continue;

    const short_verses = summaries
      .map((s) => ({
        verseHeading: s.verseHeading,
        sentenceCount: countSentences(s.summary),
      }))
      .filter((s) => s.sentenceCount < MIN_SUMMARY_SENTENCES);

    if (short_verses.length === 0) continue;

    findings.push({
      chapter_id: row.chapter_id,
      book_name: row.book_name,
      chapter_number: row.chapter_number,
      language_code: row.language_code,
      explanation_id: row.explanation_id,
      total_verses: summaries.length,
      short_verses,
    });
  }

  return findings;
}

function printHuman(findings: ChapterFinding[]) {
  if (findings.length === 0) {
    console.log(
      `[AUDIT] All active byline explanations meet the ≥${MIN_SUMMARY_SENTENCES}-sentence per-verse Summary bar.`,
    );
    return;
  }

  console.log(
    `[AUDIT] ${findings.length} chapter(s) have at least one short Summary section (< ${MIN_SUMMARY_SENTENCES} sentences):`,
  );

  for (const f of findings) {
    console.log("");
    console.log(
      `  ${f.book_name} ${f.chapter_number} [${f.language_code}] (explanation_id=${f.explanation_id})`,
    );
    console.log(
      `    short: ${f.short_verses.length} / total: ${f.total_verses}`,
    );
    for (const v of f.short_verses.slice(0, 10)) {
      console.log(`      - ${v.verseHeading}: ${v.sentenceCount} sentence(s)`);
    }
    if (f.short_verses.length > 10) {
      console.log(`      ... and ${f.short_verses.length - 10} more`);
    }
  }
}

if (import.meta.main) {
  const asJson = process.argv.includes("--json");

  auditByLineSummaries()
    .then((findings) => {
      if (asJson) {
        console.log(
          JSON.stringify(
            {
              minSentences: MIN_SUMMARY_SENTENCES,
              chaptersWithShortSummaries: findings.length,
              findings,
            },
            null,
            2,
          ),
        );
      } else {
        printHuman(findings);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("[AUDIT] failed:", error);
      process.exit(1);
    });
}

export { auditByLineSummaries };
export type { ChapterFinding, ShortVerseFinding };
