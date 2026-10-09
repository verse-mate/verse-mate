import { sql } from "kysely";

import { rescoreReport } from "./coach-review.service";
import { withoutBigIdeasReviewRow } from "./coach-scorecard";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import { FIRST_LESSON_RATIONALE, MEMORY_REINFORCEMENT } from "./rubric";

export function classDay(sessionDate: string): number {
  return new Date(`${sessionDate.slice(0, 10)}T00:00:00Z`).getUTCDay();
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
