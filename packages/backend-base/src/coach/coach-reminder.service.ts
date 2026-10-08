import { sql } from "kysely";

import { CoachReminder, render } from "../../../emails";
import type { db } from "../shared/shared.plugin";
import { coachPipelineLive } from "./coach-cutover";
import { isPlaceholderAddress } from "./coach-delivery.service";
import { classDay } from "./coach-first-lesson";
import type { CoachMailer, CoachSendResult } from "./coach.service";

export const REMINDER_TIME_ZONE = "America/Chicago";
export const REMINDER_FRESHNESS_DAYS = 14;
export const CLASS_DAY_LOOKBACK_DAYS = 28;
export const REMINDER_ITEMS = 5;

const DAY_MS = 86_400_000;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface ReminderItem {
  title: string;
  detail?: string;
}

export interface ReminderRunResult {
  date: string;
  skipped?: "parallel-run";
  sent: Array<{ coachId: string; email: string; reportId: string }>;
  failed: Array<{ coachId: string; reason: string }>;
  notReminded: Array<{ coachId: string; reason: string }>;
  summarySent: boolean;
}

export function calendarDate(now: Date, timeZone = REMINDER_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

function firstSentence(text: string, max = 280): string {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?](\s|$)/);
  const sentence = end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function proseItem(item: unknown): ReminderItem | null {
  if (typeof item === "string")
    return item.trim() ? { title: item.trim() } : null;
  const { title, paragraphs } = (item ?? {}) as {
    title?: unknown;
    paragraphs?: unknown;
  };
  if (typeof title !== "string" || !title.trim()) return null;
  const explanation = Array.isArray(paragraphs)
    ? paragraphs.find(
        (p): p is string => typeof p === "string" && !/^["“‘']/.test(p.trim()),
      )
    : undefined;
  return {
    title: title.trim(),
    ...(explanation ? { detail: firstSentence(explanation) } : {}),
  };
}

export function reminderItems(
  body: unknown,
  kind: "strengths" | "recommendations",
): ReminderItem[] {
  const feedback = ((body ?? {}) as { feedback?: Record<string, unknown> })
    .feedback;
  const prose = feedback?.[`${kind}Prose`];
  const source =
    Array.isArray(prose) && prose.length > 0 ? prose : feedback?.[kind];
  if (!Array.isArray(source)) return [];
  return source
    .map(proseItem)
    .filter((i): i is ReminderItem => i !== null)
    .slice(0, REMINDER_ITEMS);
}

export class CoachReminderService {
  constructor(
    private readonly db: db,
    private readonly mailer: CoachMailer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<ReminderRunResult> {
    const today = calendarDate(this.now());
    const result: ReminderRunResult = {
      date: today,
      sent: [],
      failed: [],
      notReminded: [],
      summarySent: false,
    };
    if (!coachPipelineLive()) return { ...result, skipped: "parallel-run" };

    const tomorrow = addDays(today, 1);
    const classDayTomorrow = classDay(tomorrow);
    const conn = this.db.getOrCreateConnection();
    const reports = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "body"])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where(
        "session_date",
        ">=",
        sql<Date>`${addDays(today, -CLASS_DAY_LOOKBACK_DAYS)}::date`,
      )
      .where("session_date", "<=", sql<Date>`${today}::date`)
      .where("held", "=", false)
      .where((eb) =>
        eb.or([
          eb("source_session_id", "like", "legacy:%"),
          eb.exists(
            eb
              .selectFrom("coach_intake_sessions")
              .select(sql`1`.as("one"))
              .whereRef(
                "coach_intake_sessions.report_id",
                "=",
                "coach_reports.id",
              )
              .where("coach_intake_sessions.state", "=", "delivered"),
          ),
        ]),
      )
      .orderBy("session_date", "desc")
      .orderBy("updated_at", "desc")
      .execute();

    const alreadySent = new Set(
      (
        await conn
          .selectFrom("coach_reminder_sends")
          .select("coach_id")
          .where("reminder_date", "=", sql<Date>`${today}::date`)
          .execute()
      ).map((r) => r.coach_id),
    );

    const byLeader = new Map<string, typeof reports>();
    for (const r of reports)
      byLeader.set(r.coach_id, [...(byLeader.get(r.coach_id) ?? []), r]);

    for (const [coachId, rows] of byLeader) {
      if (!rows.some((r) => classDay(r.date) === classDayTomorrow)) continue;
      if (alreadySent.has(coachId)) continue;
      const latest = rows[0];
      if (daysBetween(latest.date, today) > REMINDER_FRESHNESS_DAYS) {
        result.notReminded.push({
          coachId,
          reason: `latest report ${latest.date} is over ${REMINDER_FRESHNESS_DAYS} days old`,
        });
        continue;
      }
      const strengths = reminderItems(latest.body, "strengths");
      const recommendations = reminderItems(latest.body, "recommendations");
      if (strengths.length === 0 || recommendations.length === 0) {
        result.notReminded.push({
          coachId,
          reason: `report ${latest.id} has no strengths or recommendations`,
        });
        continue;
      }
      try {
        await this.remind(
          coachId,
          latest.id,
          tomorrow,
          {
            strengths,
            recommendations,
          },
          result,
        );
      } catch (error) {
        result.failed.push({
          coachId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (result.sent.length > 0)
      result.summarySent = await this.summarize(result);
    else if (result.failed.length > 0 && (await this.claimSummary(today))) {
      result.summarySent = await this.summarize(result);
      if (!result.summarySent) await this.releaseSummary(today);
    }
    return result;
  }

  private async remind(
    coachId: string,
    reportId: string,
    classDate: string,
    items: { strengths: ReminderItem[]; recommendations: ReminderItem[] },
    result: ReminderRunResult,
  ): Promise<void> {
    const leader = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_leaders")
      .select(["name", "email"])
      .where("slug", "=", coachId)
      .executeTakeFirst();
    const email = (leader?.email ?? "").trim().toLowerCase();
    if (!email) {
      result.failed.push({ coachId, reason: "no address on the roster" });
      return;
    }
    if (isPlaceholderAddress(email)) {
      result.failed.push({
        coachId,
        reason: `placeholder address ${email}, not sent`,
      });
      return;
    }
    const day = WEEKDAYS[classDay(classDate)];
    const subject = `Coaching reminder for ${day}'s class`;
    const html = await render(
      CoachReminder({
        name: leader?.name,
        classDay: day,
        strengths: items.strengths,
        recommendations: items.recommendations,
      }),
    );
    const text = [
      subject,
      "",
      "Keep doing:",
      ...items.strengths.map((s, i) => `${i + 1}. ${s.title}`),
      "",
      "Work on:",
      ...items.recommendations.map((r, i) => `${i + 1}. ${r.title}`),
    ].join("\n");
    const conn = this.db.getOrCreateConnection();
    const claimed = await conn
      .insertInto("coach_reminder_sends")
      .values({
        coach_id: coachId,
        reminder_date: result.date,
        report_id: reportId,
        email,
      })
      .onConflict((oc) => oc.doNothing())
      .returning("coach_id")
      .executeTakeFirst();
    if (!claimed) return;
    const release = () =>
      conn
        .deleteFrom("coach_reminder_sends")
        .where("coach_id", "=", coachId)
        .where("reminder_date", "=", sql<Date>`${result.date}::date`)
        .execute();
    let sent: CoachSendResult | undefined;
    try {
      sent = (await this.mailer.sendEmail({
        subject,
        to: { name: leader?.name ?? coachId, email },
        text,
        html,
      })) as CoachSendResult | undefined;
    } catch (error) {
      await release();
      throw error;
    }
    if (sent?.delivered === true) {
      result.sent.push({ coachId, email, reportId });
      return;
    }
    await release();
    result.failed.push({
      coachId,
      reason: `rejected by the mail service${sent?.error ? `: ${sent.error}` : ""}`,
    });
  }

  private async claimSummary(date: string): Promise<boolean> {
    const claimed = await this.db
      .getOrCreateConnection()
      .insertInto("coach_reminder_summaries")
      .values({ reminder_date: date })
      .onConflict((oc) => oc.doNothing())
      .returning("reminder_date")
      .executeTakeFirst();
    return claimed !== undefined;
  }

  private async releaseSummary(date: string): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .deleteFrom("coach_reminder_summaries")
      .where("reminder_date", "=", sql<Date>`${date}::date`)
      .execute();
  }

  private async summarize(result: ReminderRunResult): Promise<boolean> {
    const admins = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_admins")
      .select("email")
      .execute();
    const subject = `Coaching reminders for ${result.date}: ${result.sent.length} sent${
      result.failed.length > 0 ? `, ${result.failed.length} failed` : ""
    }`;
    const text = [
      `${result.sent.length} reminder(s) went out on ${result.date}.`,
      ...result.sent.map((s) => `Sent: ${s.coachId} (${s.email})`),
      ...result.failed.map((f) => `Failed: ${f.coachId}, ${f.reason}`),
    ].join("\n");
    let any = false;
    for (const admin of admins) {
      const email = admin.email.trim().toLowerCase();
      if (!email || isPlaceholderAddress(email)) continue;
      try {
        const sent = (await this.mailer.sendEmail({
          subject,
          to: { name: "Program admin", email },
          text,
        })) as CoachSendResult | undefined;
        any = any || sent?.delivered === true;
      } catch (error) {
        console.error(`[COACH-REMINDER] summary to ${email} failed:`, error);
      }
    }
    return any;
  }
}
