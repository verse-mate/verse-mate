import { sql } from "kysely";

import { CoachUploadReminder, render } from "../../../emails";
import type { db } from "../shared/shared.plugin";
import { ATTESTATION_LAPSES_AFTER_DAYS } from "./coach-coverage.service";
import { coachPipelineLive } from "./coach-cutover";
import {
  COACH_REPLY_TO_EMAIL,
  COACH_REPLY_TO_NAME,
  isPlaceholderAddress,
} from "./coach-delivery.service";
import { REMINDER_TIME_ZONE, calendarDate } from "./coach-reminder.service";
import { loadRotatingClasses } from "./coach-rotating.service";
import type { CoachMailer, CoachSendResult } from "./coach.service";

export const MONDAY_REMINDER_DEFAULT_CRON = "0 15 * * 1";
export const MONDAY_WINDOW_DAYS_BEFORE = 8;

const DAY_MS = 86_400_000;

type Outcome =
  | "sent"
  | "skipped"
  | "failed"
  | "not-needed"
  | "checked-by-class";

export interface MondayReminderResult {
  date: string;
  skipped?: "parallel-run";
  sent: number;
  failed: number;
}

export function coachMondayRepeat() {
  return {
    pattern:
      process.env.COACH_MONDAY_REMINDER_CRON ?? MONDAY_REMINDER_DEFAULT_CRON,
    tz: REMINDER_TIME_ZONE,
  };
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function startOfDay(date: string): Date {
  for (const hours of [4, 5, 6, 7]) {
    const at = new Date(Date.parse(`${date}T00:00:00Z`) + hours * 3_600_000);
    if (
      calendarDate(at) === date &&
      calendarDate(new Date(at.getTime() - 1)) !== date
    )
      return at;
  }
  return new Date(Date.parse(`${date}T06:00:00Z`));
}

export class CoachMondayReminderService {
  constructor(
    private readonly db: db,
    private readonly mailer: CoachMailer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<MondayReminderResult> {
    const now = this.now();
    const today = calendarDate(now);
    const result: MondayReminderResult = { date: today, sent: 0, failed: 0 };
    if (!coachPipelineLive()) return { ...result, skipped: "parallel-run" };

    const from = startOfDay(addDays(today, -MONDAY_WINDOW_DAYS_BEFORE));
    const to = startOfDay(addDays(today, 1));
    const conn = this.db.getOrCreateConnection();
    const arrived = await conn
      .selectFrom("coach_intake_sessions")
      .select(["coach_id", "rotating_class_id"])
      .where("observed_at", ">=", from)
      .where("observed_at", "<", to)
      .execute();
    const leadersWithSession = new Set(
      arrived.map((a) => a.coach_id).filter((c): c is string => c !== null),
    );
    const classesWithSession = new Set(
      arrived
        .map((a) => a.rotating_class_id)
        .filter((c): c is number => c !== null),
    );
    const leaders = await conn
      .selectFrom("coach_leaders")
      .select([
        "slug",
        "name",
        "email",
        "rotating_only",
        "not_teaching_attested_at",
      ])
      .select(
        sql<Date | null>`(SELECT max(s.observed_at) FROM coach_intake_sessions s WHERE s.coach_id = coach_leaders.slug)`.as(
          "last_observed",
        ),
      )
      .where("slug", "is not", null)
      .where("is_coach", "=", true)
      .orderBy("slug")
      .execute();
    const byId = new Map(leaders.map((l) => [l.slug as string, l]));
    const classes = await loadRotatingClasses(this.db);
    const groups = new Set(classes.map((c) => c.groupEmail));
    const lapse = now.getTime() - ATTESTATION_LAPSES_AFTER_DAYS * DAY_MS;

    const due = new Map<string, string[]>();
    const records: Array<{
      kind: "leader" | "class";
      coachId: string | null;
      classId: number | null;
      found: boolean;
      outcome: Outcome;
      email?: string;
      reason?: string;
    }> = [];
    const consider = (slug: string, found: boolean) => {
      const leader = byId.get(slug);
      if (!leader) return;
      const email = leader.email.trim().toLowerCase();
      const attested = leader.not_teaching_attested_at
        ? new Date(leader.not_teaching_attested_at)
        : null;
      const inForce =
        attested !== null &&
        attested.getTime() >= lapse &&
        !(leader.last_observed && new Date(leader.last_observed) > attested);
      const skip = (reason: string) =>
        records.push({
          kind: "leader",
          coachId: slug,
          classId: null,
          found,
          outcome: "skipped",
          email,
          reason,
        });
      if (inForce) return skip("attested not teaching");
      if (isPlaceholderAddress(email)) return skip("placeholder address");
      if (groups.has(email))
        return skip("no address of their own, only the class's group address");
      due.set(email, [...(due.get(email) ?? []), slug]);
    };

    const remindedByClass = new Set<string>();
    for (const klass of classes) {
      const found = classesWithSession.has(klass.id);
      records.push({
        kind: "class",
        coachId: null,
        classId: klass.id,
        found,
        outcome: found ? "not-needed" : "checked-by-class",
      });
      if (found) continue;
      for (const slug of klass.leaders) {
        if (remindedByClass.has(slug)) continue;
        remindedByClass.add(slug);
        consider(slug, false);
      }
    }
    for (const leader of leaders) {
      const slug = leader.slug as string;
      const found = leadersWithSession.has(slug);
      if (leader.rotating_only) {
        if (!remindedByClass.has(slug))
          records.push({
            kind: "leader",
            coachId: slug,
            classId: null,
            found,
            outcome: "checked-by-class",
          });
        continue;
      }
      if (found) {
        records.push({
          kind: "leader",
          coachId: slug,
          classId: null,
          found,
          outcome: "not-needed",
        });
        continue;
      }
      if (remindedByClass.has(slug)) continue;
      consider(slug, false);
    }

    const already = new Set(
      (
        await conn
          .selectFrom("coach_monday_reminders")
          .select("email")
          .where("run_date", "=", sql<Date>`${today}::date`)
          .where("outcome", "=", "sent")
          .execute()
      ).map((r) => r.email),
    );
    const uploadUrl = `${process.env.APP_URL ?? ""}/coach/upload`;
    for (const [email, slugs] of due) {
      if (already.has(email)) continue;
      const leader = byId.get(slugs[0]);
      let sent: CoachSendResult | undefined;
      try {
        sent = (await this.mailer.sendEmail({
          subject: "Did your group meet this week?",
          to: { name: leader?.name ?? "", email },
          replyTo: { name: COACH_REPLY_TO_NAME, email: COACH_REPLY_TO_EMAIL },
          text: `We did not receive a recording of your session this past week. If your group met, upload the video in the portal: ${uploadUrl} . If you did not meet, nothing is needed.`,
          html: await render(
            CoachUploadReminder({
              name: slugs.length === 1 ? leader?.name : undefined,
              uploadUrl,
            }),
          ),
        })) as CoachSendResult | undefined;
      } catch (error) {
        sent = { delivered: false, error: String(error) } as CoachSendResult;
      }
      const ok = sent?.delivered === true;
      if (ok) result.sent += 1;
      else result.failed += 1;
      for (const slug of slugs)
        records.push({
          kind: "leader",
          coachId: slug,
          classId: null,
          found: false,
          outcome: ok ? "sent" : "failed",
          email,
          ...(ok
            ? {}
            : { reason: sent?.error ?? "the mail service refused it" }),
        });
    }

    for (const r of records)
      await sql`
        INSERT INTO coach_monday_reminders
          (run_date, kind, coach_id, rotating_class_id, found, outcome, email, reason)
        VALUES (${today}::date, ${r.kind}, ${r.coachId}, ${r.classId}, ${r.found},
                ${r.outcome}, ${r.email ?? null}, ${r.reason ?? null})
        ON CONFLICT (run_date, kind, coalesce(coach_id, ''), coalesce(rotating_class_id, 0))
        DO UPDATE SET found = EXCLUDED.found, outcome = EXCLUDED.outcome,
                      email = EXCLUDED.email, reason = EXCLUDED.reason
        WHERE coach_monday_reminders.outcome <> 'sent'
      `.execute(conn);
    return result;
  }
}
