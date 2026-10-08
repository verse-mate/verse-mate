import type Database from "database/src/models/Database";
import { type ExpressionBuilder, sql } from "kysely";

import { CoachReport, render } from "../../../emails";
import type { db } from "../shared/shared.plugin";
import { calibrationShortfalls } from "./coach-calibration";
import { coachPipelineLive } from "./coach-cutover";
import {
  CoachGovernanceService,
  type GovernanceViolation,
  type ReportEvidence,
  coldRecallInFeedback,
} from "./coach-governance.service";
import type { CoachMailer, CoachSendResult } from "./coach.service";
import { statusForScore } from "./rubric";

/**
 * Delivering a finished report (change: port-coach-pipeline, tasks 6.1, 6.3,
 * 6.5, 6.6, 6.7, 6.9).
 *
 * Everything a leader receives goes through here. A report assembled by a
 * one-off script and mailed directly would skip the governance rules, the
 * three-recipient rule and the live check all at once, which is why delivery
 * is a single path rather than a convention.
 */

/** Where a leader's reply should land, now that the coach mailbox sends nothing. */
export const COACH_REPLY_TO_EMAIL =
  process.env.COACH_REPLY_TO_EMAIL ?? "coach@versemate.app";
export const COACH_REPLY_TO_NAME = "VerseMate Coaching";

export const DELIVERY_ATTEMPT_LIMIT = 5;

export function isPlaceholderAddress(email: string): boolean {
  return email.trim().toLowerCase().replace(/\.+$/, "").endsWith(".invalid");
}

export const STALE_DELIVERY_CLAIM = sql<Date>`NOW() - interval '15 minutes'`;

const CLAIM_TOKEN = sql<string>`updated_at::text`;
const REVISION_CLAIM_TOKEN = sql<string>`sending_at::text`;

type Claim =
  | { status: "claimed"; token: string; deliveredTo: string[] }
  | {
      status:
        | "already-delivered"
        | "in-flight"
        | "unknown-report"
        | "awaiting-release";
    };

export type DeliveryRefusal =
  | "unknown-report"
  | "already-delivered"
  | "in-flight"
  | "awaiting-release"
  | "parallel-run"
  | "calibration-blocked"
  | "governance-blocked"
  | "cold-recall-improvement"
  | "send-failed";

export interface DeliveryResult {
  delivered: boolean;
  refusal?: DeliveryRefusal;
  violations?: GovernanceViolation[];
  shortfalls?: string[];
  coldRecall?: string[];
  /** Confirmed sends. Delivery is complete only at the full recipient set. */
  sends?: Array<{ email: string; delivered: boolean; error?: string }>;
  skipped?: string[];
  subject?: string;
}

/**
 * The subject line (task 6.7).
 *
 * Session date, leader name, and the sanitized RECORDED SESSION TITLE, the
 * same field intake attributes the leader from. The old convention used the
 * leader-authored email subject, which no longer exists once the email path is
 * dropped, so deriving it is not a preference but the only option left.
 *
 * The same subject goes to all three recipients, so a reply thread stays one
 * conversation rather than three.
 */
export function reportSubject(input: {
  sessionDate: string;
  leaderName: string;
  sessionTitle: string;
}): string {
  const title = input.sessionTitle
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = [input.sessionDate, input.leaderName, title].filter(
    (p) => p.length > 0,
  );
  return `Coaching report — ${parts.join(" — ")}`;
}

export const REVISED_SUFFIX = " (revised)";

export interface RevisionSendResult {
  sent: boolean;
  refusal?:
    | "parallel-run"
    | "no-revision"
    | "already-sent"
    | "in-flight"
    | "not-live"
    | "send-failed";
  revision?: number;
  sends?: Array<{ email: string; delivered: boolean; error?: string }>;
  skipped?: string[];
  subject?: string;
}

export class CoachDeliveryService {
  private readonly governance: CoachGovernanceService;
  /**
   * One in-flight delivery per leader.
   *
   * Rule 2 asks whether a quote was used in an EARLIER report, and two reports
   * produced in one poll cycle would otherwise each see the other as not yet
   * existing, both would ship with the same quote. Serializing per leader is
   * what gives "earlier" a meaning.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: db,
    private readonly mailer: CoachMailer,
  ) {
    this.governance = new CoachGovernanceService(db);
  }

  async deliver(input: {
    reportId: string;
    evidence: ReportEvidence;
  }): Promise<DeliveryResult> {
    if (!coachPipelineLive())
      return { delivered: false, refusal: "parallel-run" };
    const coachId = await this.coachFor(input.reportId);
    if (!coachId) return { delivered: false, refusal: "unknown-report" };

    const previous = this.inFlight.get(coachId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() =>
        this.deliverSerially(input.reportId, coachId, input.evidence),
      );
    this.inFlight.set(coachId, run);
    try {
      return await run;
    } finally {
      if (this.inFlight.get(coachId) === run) this.inFlight.delete(coachId);
    }
  }

  private async coachFor(reportId: string): Promise<string | null> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select("coach_id")
      .where("id", "=", reportId)
      .executeTakeFirst();
    return row?.coach_id ?? null;
  }

  private async deliverSerially(
    reportId: string,
    coachId: string,
    evidence: ReportEvidence,
  ): Promise<DeliveryResult> {
    const claim = await this.claim(reportId);
    if (claim.status !== "claimed")
      return { delivered: false, refusal: claim.status };
    const report = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "summary", "body", "first_lesson"])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("id", "=", reportId)
      .executeTakeFirst();
    if (!report) return { delivered: false, refusal: "unknown-report" };
    return this.deliverClaimed(reportId, coachId, evidence, report, claim);
  }

  private async claim(reportId: string): Promise<Claim> {
    const conn = this.db.getOrCreateConnection();
    try {
      const claimed = await conn
        .updateTable("coach_intake_sessions")
        .set({ state: "delivering", updated_at: sql`clock_timestamp()` })
        .where("report_id", "=", reportId)
        .where("release_required", "=", false)
        .where((eb) =>
          eb.or([
            eb("state", "in", ["scored", "delivery_pending"]),
            eb.and([
              eb("state", "=", "delivering"),
              eb("updated_at", "<", STALE_DELIVERY_CLAIM),
            ]),
          ]),
        )
        .returning(["delivered_to", CLAIM_TOKEN.as("token")])
        .executeTakeFirst();
      if (claimed) {
        return {
          status: "claimed",
          token: claimed.token,
          deliveredTo: claimed.delivered_to,
        };
      }
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
      await conn
        .updateTable("coach_intake_sessions")
        .set({ state: "delivery_pending", updated_at: sql`NOW()` })
        .where("report_id", "=", reportId)
        .where("state", "=", "scored")
        .execute();
      return { status: "in-flight" };
    }
    const session = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "release_required"])
      .where("report_id", "=", reportId)
      .executeTakeFirst();
    if (!session) return { status: "unknown-report" };
    if (session.state === "delivered") return { status: "already-delivered" };
    return {
      status: session.release_required ? "awaiting-release" : "in-flight",
    };
  }

  private async renewClaim(
    reportId: string,
    token: string,
  ): Promise<string | null> {
    const renewed = await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({ updated_at: sql`clock_timestamp()` })
      .where("report_id", "=", reportId)
      .where("state", "=", "delivering")
      .where(CLAIM_TOKEN, "=", token)
      .returning(CLAIM_TOKEN.as("token"))
      .executeTakeFirst();
    return renewed?.token ?? null;
  }

  private async recordRecipient(
    reportId: string,
    email: string,
    token: string,
  ): Promise<boolean> {
    const recorded = await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({
        delivered_to: sql`CASE WHEN ${email} = ANY(delivered_to) THEN delivered_to ELSE array_append(delivered_to, ${email}) END`,
      })
      .where("report_id", "=", reportId)
      .where("state", "=", "delivering")
      .where(CLAIM_TOKEN, "=", token)
      .executeTakeFirst();
    return Number(recorded.numUpdatedRows ?? 0) > 0;
  }

  private async deliverClaimed(
    reportId: string,
    coachId: string,
    evidence: ReportEvidence,
    report: {
      summary: unknown;
      body: unknown;
      first_lesson: boolean;
      date: string;
    },
    claim: { token: string; deliveredTo: string[] },
  ): Promise<DeliveryResult> {
    const conn = this.db.getOrCreateConnection();
    const leader = await conn
      .selectFrom("coach_leaders")
      .select(["name", "email"])
      .where("slug", "=", coachId)
      .executeTakeFirst();

    const summary = (report.summary ?? {}) as Record<string, unknown>;

    const alreadyEmailed = claim.deliveredTo.length > 0;
    const shortfalls = alreadyEmailed
      ? []
      : await calibrationShortfalls(this.db, reportId);
    if (shortfalls.length > 0) {
      await this.setHeld(reportId, true);
      await conn
        .updateTable("coach_intake_sessions")
        .set({
          state: "delivery_pending",
          hold_reason: `held for calibration: ${shortfalls.join("; ")}`,
          updated_at: sql`NOW()`,
        })
        .where("report_id", "=", reportId)
        .where("state", "=", "delivering")
        .execute();
      console.error(
        `[COACH-DELIVERY] ${reportId} held: ${shortfalls.join("; ")}`,
      );
      return { delivered: false, refusal: "calibration-blocked", shortfalls };
    }

    const verdict = alreadyEmailed
      ? { passed: true, violations: [] }
      : await this.governance.check({
          reportId,
          coachId,
          body: JSON.stringify(report.body ?? {}),
          evidence,
        });
    if (!verdict.passed) {
      await this.setHeld(reportId, true);
      await conn
        .updateTable("coach_intake_sessions")
        .set({
          state: "scored",
          hold_reason: `held by governance: ${verdict.violations
            .map((v) => v.rule)
            .join(", ")}`,
          updated_at: sql`NOW()`,
        })
        .where("report_id", "=", reportId)
        .where("state", "=", "delivering")
        .execute();
      return {
        delivered: false,
        refusal: "governance-blocked",
        violations: verdict.violations,
      };
    }

    const coldRecall =
      report.first_lesson && !alreadyEmailed
        ? coldRecallInFeedback(
            ((report.body ?? {}) as { feedback?: unknown }).feedback,
          )
        : [];
    if (coldRecall.length > 0) {
      await this.setHeld(reportId, true);
      await conn
        .updateTable("coach_intake_sessions")
        .set({
          state: "scored",
          hold_reason: `held: a first lesson with a cold-recall improvement: ${coldRecall.join("; ")}`,
          updated_at: sql`NOW()`,
        })
        .where("report_id", "=", reportId)
        .where("state", "=", "delivering")
        .execute();
      return {
        delivered: false,
        refusal: "cold-recall-improvement",
        coldRecall,
      };
    }

    const subject = reportSubject({
      sessionDate: report.date,
      leaderName: leader?.name ?? coachId,
      sessionTitle: String(summary.session ?? ""),
    });

    const { recipients, skipped } = await this.recipients(
      coachId,
      leader?.email ?? null,
    );
    const html = await reportEmailHtml(reportId, leader?.name, summary, report);

    const sends: NonNullable<DeliveryResult["sends"]> = [];
    if (!(await this.publishWithinClaim(reportId, claim.token)))
      return {
        delivered: false,
        refusal: "in-flight",
        sends,
        skipped,
        subject,
      };
    const confirmed = new Set(claim.deliveredTo);
    let token = claim.token;
    for (const to of recipients.filter((r) => !confirmed.has(r.email))) {
      const renewed = await this.renewClaim(reportId, token);
      if (renewed === null) {
        return {
          delivered: false,
          refusal: "in-flight",
          sends,
          skipped,
          subject,
        };
      }
      token = renewed;
      const result = await this.send({
        subject,
        to,
        replyTo: { name: COACH_REPLY_TO_NAME, email: COACH_REPLY_TO_EMAIL },
        text: `${subject}\n\n${portalUrlFor(reportId)}`,
        html,
      });
      sends.push({
        email: to.email,
        delivered: result?.delivered === true,
        error: result?.error,
      });
      if (result?.delivered === true) {
        if (!(await this.recordRecipient(reportId, to.email, token)))
          return {
            delivered: false,
            refusal: "in-flight",
            sends,
            skipped,
            subject,
          };
        confirmed.add(to.email);
      }
    }

    // 6.5, delivery is complete only when EVERY recipient's send is confirmed.
    // A partial delivery reported as success is how an admin stops seeing a
    // leader's reports without anyone noticing.
    const allSent =
      recipients.length > 0 && recipients.every((r) => confirmed.has(r.email));
    if (!allSent) {
      await this.countSendFailure(reportId, token);
      return {
        delivered: false,
        refusal: "send-failed",
        sends,
        skipped,
        subject,
      };
    }

    const finished = await conn
      .updateTable("coach_intake_sessions")
      .set({
        state: "delivered",
        hold_reason: null,
        skipped_recipients: sql`${sql.val(skipped)}::text[]`,
        updated_at: sql`NOW()`,
      })
      .where("report_id", "=", reportId)
      .where("state", "=", "delivering")
      .where(CLAIM_TOKEN, "=", token)
      .executeTakeFirst();
    if (Number(finished.numUpdatedRows ?? 0) === 0) {
      return {
        delivered: false,
        refusal: "in-flight",
        sends,
        skipped,
        subject,
      };
    }
    await this.governance.recordEvidence(reportId, evidence);
    if (skipped.length > 0)
      console.error(
        `[COACH-DELIVERY] ${reportId} not emailed to placeholder address(es): ${skipped.join(", ")}`,
      );

    return { delivered: true, sends, skipped, subject };
  }

  async sendRevision(reportId: string): Promise<RevisionSendResult> {
    if (!coachPipelineLive()) return { sent: false, refusal: "parallel-run" };
    const conn = this.db.getOrCreateConnection();
    const amendment = await conn
      .selectFrom("coach_report_amendments")
      .select(["revision", "sent_at"])
      .where("report_id", "=", reportId)
      .orderBy("revision", "desc")
      .executeTakeFirst();
    if (!amendment) return { sent: false, refusal: "no-revision" };
    if (amendment.sent_at)
      return {
        sent: false,
        refusal: "already-sent",
        revision: amendment.revision,
      };

    const claim = await this.claimRevision(reportId, amendment.revision);
    if (claim.status !== "claimed")
      return {
        sent: false,
        refusal: claim.status,
        revision: amendment.revision,
      };

    const report = await conn
      .selectFrom("coach_reports")
      .select(["coach_id", "summary", "body"])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("id", "=", reportId)
      .executeTakeFirstOrThrow();
    const leader = await conn
      .selectFrom("coach_leaders")
      .select(["name", "email"])
      .where("slug", "=", report.coach_id)
      .executeTakeFirst();
    const summary = (report.summary ?? {}) as Record<string, unknown>;
    const subject = `${reportSubject({
      sessionDate: report.date,
      leaderName: leader?.name ?? report.coach_id,
      sessionTitle: String(summary.session ?? ""),
    })}${REVISED_SUFFIX}`;
    const { recipients, skipped } = await this.recipients(
      report.coach_id,
      leader?.email ?? null,
    );
    const html = await reportEmailHtml(reportId, leader?.name, summary, report);

    const confirmed = new Set(claim.sentTo);
    const sends: NonNullable<RevisionSendResult["sends"]> = [];
    let token = claim.token;
    const fenced = () => ({
      sent: false,
      refusal: "in-flight" as const,
      revision: amendment.revision,
      sends,
      skipped,
      subject,
    });
    for (const to of recipients.filter((r) => !confirmed.has(r.email))) {
      const renewed = await this.renewRevisionClaim(
        reportId,
        amendment.revision,
        token,
      );
      if (renewed === null) return fenced();
      token = renewed;
      const result = await this.send({
        subject,
        to,
        replyTo: { name: COACH_REPLY_TO_NAME, email: COACH_REPLY_TO_EMAIL },
        text: `${subject}\n\n${portalUrlFor(reportId)}`,
        html,
      });
      sends.push({
        email: to.email,
        delivered: result?.delivered === true,
        error: result?.error,
      });
      if (result?.delivered !== true) continue;
      confirmed.add(to.email);
      await conn
        .updateTable("coach_report_amendments")
        .set({ sent_to: sql`array_append(sent_to, ${to.email})` })
        .where("report_id", "=", reportId)
        .where("revision", "=", amendment.revision)
        .where(sql<boolean>`NOT (${to.email} = ANY(sent_to))`)
        .execute();
    }

    const allSent =
      recipients.length > 0 && recipients.every((r) => confirmed.has(r.email));
    const released = await conn
      .updateTable("coach_report_amendments")
      .set({
        sending_at: null,
        ...(allSent
          ? {
              sent_at: sql`NOW()`,
              skipped_recipients: sql`${sql.val(skipped)}::text[]`,
            }
          : {}),
      })
      .where("report_id", "=", reportId)
      .where("revision", "=", amendment.revision)
      .where(REVISION_CLAIM_TOKEN, "=", token)
      .executeTakeFirst();
    if (Number(released.numUpdatedRows ?? 0) === 0) return fenced();
    if (skipped.length > 0)
      console.error(
        `[COACH-DELIVERY] revision ${amendment.revision} of ${reportId} not emailed to placeholder address(es): ${skipped.join(", ")}`,
      );
    return {
      sent: allSent,
      ...(allSent ? {} : { refusal: "send-failed" as const }),
      revision: amendment.revision,
      sends,
      skipped,
      subject,
    };
  }

  private async claimRevision(
    reportId: string,
    revision: number,
  ): Promise<
    | { status: "claimed"; token: string; sentTo: string[] }
    | { status: "already-sent" | "in-flight" | "not-live" }
  > {
    const conn = this.db.getOrCreateConnection();
    const claimed = await conn
      .updateTable("coach_report_amendments")
      .set({ sending_at: sql`clock_timestamp()` })
      .where("report_id", "=", reportId)
      .where("revision", "=", revision)
      .where("sent_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("sending_at", "is", null),
          eb("sending_at", "<", STALE_DELIVERY_CLAIM),
        ]),
      )
      .where(revisionLive)
      .returning(["sent_to", REVISION_CLAIM_TOKEN.as("token")])
      .executeTakeFirst();
    if (claimed)
      return {
        status: "claimed",
        token: claimed.token,
        sentTo: claimed.sent_to,
      };
    const row = await conn
      .selectFrom("coach_report_amendments")
      .select("sent_at")
      .select((eb) => revisionLive(eb).as("live"))
      .where("report_id", "=", reportId)
      .where("revision", "=", revision)
      .executeTakeFirst();
    if (row?.sent_at) return { status: "already-sent" };
    return { status: row?.live ? "in-flight" : "not-live" };
  }

  private async renewRevisionClaim(
    reportId: string,
    revision: number,
    token: string,
  ): Promise<string | null> {
    const renewed = await this.db
      .getOrCreateConnection()
      .updateTable("coach_report_amendments")
      .set({ sending_at: sql`clock_timestamp()` })
      .where("report_id", "=", reportId)
      .where("revision", "=", revision)
      .where("sent_at", "is", null)
      .where(REVISION_CLAIM_TOKEN, "=", token)
      .where(revisionLive)
      .returning(REVISION_CLAIM_TOKEN.as("token"))
      .executeTakeFirst();
    return renewed?.token ?? null;
  }

  private async publishWithinClaim(
    reportId: string,
    token: string,
  ): Promise<boolean> {
    const published = await this.db
      .getOrCreateConnection()
      .updateTable("coach_reports")
      .set({ held: false })
      .where("id", "=", reportId)
      .where(({ exists, selectFrom }) =>
        exists(
          selectFrom("coach_intake_sessions")
            .select("report_id")
            .where("report_id", "=", reportId)
            .where("state", "=", "delivering")
            .where(CLAIM_TOKEN, "=", token),
        ),
      )
      .executeTakeFirst();
    return Number(published.numUpdatedRows ?? 0) > 0;
  }

  private async setHeld(reportId: string, held: boolean): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("coach_reports")
      .set({ held })
      .where("id", "=", reportId)
      .execute();
  }

  private async send(
    data: Parameters<CoachMailer["sendEmail"]>[0],
  ): Promise<CoachSendResult | undefined> {
    try {
      return (await this.mailer.sendEmail(data)) as CoachSendResult | undefined;
    } catch (error) {
      return {
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async countSendFailure(
    reportId: string,
    token: string,
  ): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({
        retry_count: sql`retry_count + 1`,
        state: sql`CASE WHEN retry_count + 1 >= ${DELIVERY_ATTEMPT_LIMIT} THEN 'delivery_failed' ELSE 'delivery_pending' END`,
        updated_at: sql`NOW()`,
      })
      .where("report_id", "=", reportId)
      .where("state", "=", "delivering")
      .where(CLAIM_TOKEN, "=", token)
      .execute();
  }

  /**
   * 6.5, the three-recipient rule: the leader, the benchmark leader, and the
   * program admin. Its stated exceptions: a recipient with no address is
   * skipped rather than blocking, and nobody is mailed twice when they hold
   * two of the roles.
   */
  private async recipients(
    coachId: string,
    leaderEmail: string | null,
  ): Promise<{
    recipients: Array<{ name: string; email: string }>;
    skipped: string[];
  }> {
    const conn = this.db.getOrCreateConnection();
    const [benchmark, admins] = await Promise.all([
      conn
        .selectFrom("coach_leaders")
        .select(["name", "email"])
        .where("is_benchmark", "=", true)
        .executeTakeFirst(),
      conn.selectFrom("coach_admins").select("email").execute(),
    ]);

    const out: Array<{ name: string; email: string }> = [];
    const skipped: string[] = [];
    const seen = new Set<string>();
    const add = (name: string, email: string | null | undefined) => {
      const key = (email ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (isPlaceholderAddress(key)) skipped.push(key);
      else out.push({ name, email: key });
    };

    add(coachId, leaderEmail);
    add(benchmark?.name ?? "Benchmark leader", benchmark?.email);
    for (const admin of admins) add("Program admin", admin.email);
    return { recipients: out, skipped };
  }
}

function revisionLive(
  eb: ExpressionBuilder<Database, "coach_report_amendments">,
) {
  return eb.exists(
    eb
      .selectFrom("coach_reports")
      .innerJoin(
        "coach_intake_sessions",
        "coach_intake_sessions.report_id",
        "coach_reports.id",
      )
      .select("coach_reports.id")
      .whereRef("coach_reports.id", "=", "coach_report_amendments.report_id")
      .whereRef(
        "coach_reports.coach_id",
        "=",
        "coach_report_amendments.coach_id",
      )
      .where("coach_reports.held", "=", false)
      .where("coach_intake_sessions.state", "=", "delivered"),
  );
}

async function reportEmailHtml(
  reportId: string,
  name: string | undefined,
  summary: Record<string, unknown>,
  report: { body: unknown; date: string },
): Promise<string> {
  const score = Number(summary.score ?? 0);
  return render(
    CoachReport({
      name,
      sessionLabel: `${String(summary.session ?? "Session")} — ${report.date}`,
      score,
      status: String(summary.status ?? statusForScore(score).label),
      headline: String(
        ((report.body ?? {}) as { feedback?: { headline?: string } }).feedback
          ?.headline ?? "",
      ),
      portalUrl: portalUrlFor(reportId),
    }),
  );
}

function portalUrlFor(reportId: string): string {
  return `${process.env.APP_URL ?? ""}/coach?s=${encodeURIComponent(reportId)}`;
}
