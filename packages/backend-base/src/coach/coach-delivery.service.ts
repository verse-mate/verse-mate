import { sql } from "kysely";

import { CoachReport, render } from "../../../emails";
import type { db } from "../shared/shared.plugin";
import { calibrationShortfalls } from "./coach-calibration";
import {
  CoachGovernanceService,
  type GovernanceViolation,
  type ReportEvidence,
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

export const STALE_DELIVERY_CLAIM = sql<Date>`NOW() - interval '15 minutes'`;

const CLAIM_TOKEN = sql<string>`updated_at::text`;

type Claim =
  | { status: "claimed"; token: string; deliveredTo: string[] }
  | { status: "already-delivered" | "in-flight" | "unknown-report" };

export type DeliveryRefusal =
  | "unknown-report"
  | "already-delivered"
  | "in-flight"
  | "calibration-blocked"
  | "governance-blocked"
  | "send-failed";

export interface DeliveryResult {
  delivered: boolean;
  refusal?: DeliveryRefusal;
  violations?: GovernanceViolation[];
  shortfalls?: string[];
  /** Confirmed sends. Delivery is complete only at the full recipient set. */
  sends?: Array<{ email: string; delivered: boolean; error?: string }>;
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
    const conn = this.db.getOrCreateConnection();

    // ONE read, and it is also the liveness check the spec asks for ("confirm
    // the report is live before sending", scenario "Report is not yet live").
    // Publishing commits before delivery is called, so a readable row IS a
    // report the portal serves. There used to be a second `isLive` query three
    // statements below this one, asking the same question of the same row: a
    // refusal that could never fire, which read as a check and was decoration.
    // Missing means the row went away mid-delivery, which is refused rather
    // than thrown.
    const report = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "summary", "body"])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("id", "=", reportId)
      .executeTakeFirst();
    if (!report) return { delivered: false, refusal: "unknown-report" };

    const claim = await this.claim(reportId);
    if (claim.status !== "claimed")
      return { delivered: false, refusal: claim.status };
    return this.deliverClaimed(reportId, coachId, evidence, report, claim);
  }

  private async claim(reportId: string): Promise<Claim> {
    const conn = this.db.getOrCreateConnection();
    try {
      const claimed = await conn
        .updateTable("coach_intake_sessions")
        .set({ state: "delivering", updated_at: sql`clock_timestamp()` })
        .where("report_id", "=", reportId)
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
      .select("state")
      .where("report_id", "=", reportId)
      .executeTakeFirst();
    if (!session) return { status: "unknown-report" };
    return {
      status: session.state === "delivered" ? "already-delivered" : "in-flight",
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
  ): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("coach_intake_sessions")
      .set({ delivered_to: sql`array_append(delivered_to, ${email})` })
      .where("report_id", "=", reportId)
      .where(sql<boolean>`NOT (${email} = ANY(delivered_to))`)
      .execute();
  }

  private async deliverClaimed(
    reportId: string,
    coachId: string,
    evidence: ReportEvidence,
    report: {
      summary: unknown;
      body: unknown;
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

    const shortfalls = await calibrationShortfalls(this.db, reportId);
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

    // 6.2 at delivery time, against what is already persisted.
    const verdict = await this.governance.check({
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

    const subject = reportSubject({
      sessionDate: report.date,
      leaderName: leader?.name ?? coachId,
      sessionTitle: String(summary.session ?? ""),
    });

    const recipients = await this.recipients(coachId, leader?.email ?? null);
    const score = Number(summary.score ?? 0);
    const html = await render(
      CoachReport({
        name: leader?.name,
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

    const sends: NonNullable<DeliveryResult["sends"]> = [];
    const confirmed = new Set(claim.deliveredTo);
    let token = claim.token;
    for (const to of recipients.filter((r) => !confirmed.has(r.email))) {
      const renewed = await this.renewClaim(reportId, token);
      if (renewed === null) {
        return { delivered: false, refusal: "in-flight", sends, subject };
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
        await this.recordRecipient(reportId, to.email);
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
      return { delivered: false, refusal: "send-failed", sends, subject };
    }

    const finished = await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivered", hold_reason: null, updated_at: sql`NOW()` })
      .where("report_id", "=", reportId)
      .where("state", "=", "delivering")
      .where(CLAIM_TOKEN, "=", token)
      .executeTakeFirst();
    if (Number(finished.numUpdatedRows ?? 0) === 0) {
      return { delivered: false, refusal: "in-flight", sends, subject };
    }
    await this.governance.recordEvidence(reportId, evidence);
    await this.setHeld(reportId, false);

    return { delivered: true, sends, subject };
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
  ): Promise<Array<{ name: string; email: string }>> {
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
    const seen = new Set<string>();
    const add = (name: string, email: string | null | undefined) => {
      const key = (email ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({ name, email: key });
    };

    add(coachId, leaderEmail);
    add(benchmark?.name ?? "Benchmark leader", benchmark?.email);
    for (const admin of admins) add("Program admin", admin.email);
    return out;
  }
}

function portalUrlFor(reportId: string): string {
  return `${process.env.APP_URL ?? ""}/coach?s=${encodeURIComponent(reportId)}`;
}
