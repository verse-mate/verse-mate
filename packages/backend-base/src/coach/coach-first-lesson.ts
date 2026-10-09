import { sql } from "kysely";

import { rescoreReport } from "./coach-review.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import { FIRST_LESSON_RATIONALE, MEMORY_REINFORCEMENT } from "./rubric";

export const BIG_IDEAS_REVIEW_LABEL = "Big Ideas review at open";
export const BIG_IDEAS_REVIEW_TARGET = "5-10 min";
export const SCORECARD_RATINGS = [
  "STRONG",
  "ON TARGET",
  "NEEDS WORK",
  "N/A",
] as const;
export type ScorecardRating = (typeof SCORECARD_RATINGS)[number];

export interface BigIdeasReviewRow {
  value: string;
  rating: ScorecardRating;
}

const REVIEW_ROW = /^big ideas review( at open)?\s*:/i;
const TIME_TABLE = /^Scorecard — Table 3$/;

export function classDay(sessionDate: string): number {
  return new Date(`${sessionDate.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export function validBigIdeasReviewRow(
  row: { value?: unknown; rating?: unknown } | null | undefined,
): BigIdeasReviewRow | null {
  const value = typeof row?.value === "string" ? row.value.trim() : "";
  const rating = SCORECARD_RATINGS.find((r) => r === row?.rating);
  return value && rating ? { value, rating } : null;
}

type Section = { title?: unknown; bullets?: unknown };

function sectionsOf(body: unknown): Section[] {
  const sections = (body as { sections?: unknown } | null)?.sections;
  return Array.isArray(sections) ? (sections as Section[]) : [];
}

export function withoutBigIdeasReviewRow<T>(body: T): T {
  const sections = sectionsOf(body);
  if (sections.length === 0) return body;
  return {
    ...(body as object),
    sections: sections.map((section) =>
      Array.isArray(section.bullets)
        ? {
            ...section,
            bullets: section.bullets.filter(
              (b) => !(typeof b === "string" && REVIEW_ROW.test(b)),
            ),
          }
        : section,
    ),
  } as T;
}

export function withBigIdeasReviewRow<T>(body: T, row: BigIdeasReviewRow): T {
  const bullet = `${BIG_IDEAS_REVIEW_LABEL}: ${row.value}  (Target: ${BIG_IDEAS_REVIEW_TARGET})  → ${row.rating}`;
  const sections = sectionsOf(withoutBigIdeasReviewRow(body));
  const at = sections.findIndex(
    (s) => typeof s.title === "string" && TIME_TABLE.test(s.title),
  );
  const next =
    at < 0
      ? [...sections, { title: "Scorecard — Table 3", bullets: [bullet] }]
      : sections.map((section, i) => {
          if (i !== at) return section;
          const bullets = Array.isArray(section.bullets)
            ? [...section.bullets]
            : [];
          bullets.splice(Math.min(1, bullets.length), 0, bullet);
          return { ...section, bullets };
        });
  return { ...((body ?? {}) as object), sections: next } as T;
}

export async function applyFirstLessonDetection(
  trx: CoachReportsWriter,
  reportId: string,
  line: string | null,
): Promise<boolean> {
  const report = await trx
    .selectFrom("coach_reports")
    .select(["first_lesson", "first_lesson_source", "body"])
    .where("id", "=", reportId)
    .forUpdate()
    .executeTakeFirst();
  if (!report) return false;
  if (report.first_lesson_source === "admin") return report.first_lesson;
  const memory = await trx
    .selectFrom("coach_report_dimension_scores")
    .select("provenance")
    .where("report_id", "=", reportId)
    .where("dimension_n", "=", MEMORY_REINFORCEMENT)
    .executeTakeFirst();
  if (memory?.provenance === "human") return report.first_lesson;

  const first = line !== null && line.trim().length > 0;
  await trx
    .updateTable("coach_reports")
    .set({
      first_lesson: first,
      first_lesson_source: first ? "detected" : null,
      first_lesson_line: first ? line.trim() : null,
      ...(first
        ? { body: JSON.stringify(withoutBigIdeasReviewRow(report.body)) }
        : {}),
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
