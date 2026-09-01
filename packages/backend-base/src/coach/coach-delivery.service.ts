import { sql } from "kysely";

import { CoachReport, render } from "../../../emails";
import type { db } from "../shared/shared.plugin";
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
 * three-recipient rule and the live check all at once — which is why delivery
 * is a single path rather than a convention.
 */

/** Where a leader's reply should land, now that the coach mailbox sends nothing. */
export const COACH_REPLY_TO_EMAIL =
  process.env.COACH_REPLY_TO_EMAIL ?? "coach@versemate.app";
export const COACH_REPLY_TO_NAME = "VerseMate Coaching";

export type DeliveryRefusal =
  | "unknown-report"
  | "not-live"
  | "governance-blocked"
  | "send-failed";

export interface DeliveryResult {
  delivered: boolean;
  refusal?: DeliveryRefusal;
  violations?: GovernanceViolation[];
  /** Confirmed sends. Delivery is complete only at the full recipient set. */
  sends?: Array<{ email: string; delivered: boolean; error?: string }>;
  subject?: string;
}

/**
 * The subject line (task 6.7).
 *
 * Session date, leader name, and the sanitized RECORDED SESSION TITLE — the
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
   * existing — both would ship with the same quote. Serializing per leader is
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

    const report = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "summary", "body"])
      .select(sql<string>`to_char(session_date, 'YYYY-MM-DD')`.as("date"))
      .where("id", "=", reportId)
      .executeTakeFirstOrThrow();

    const leader = await conn
      .selectFrom("coach_leaders")
      .select(["name", "email"])
      .where("slug", "=", coachId)
      .executeTakeFirst();

    const summary = (report.summary ?? {}) as Record<string, unknown>;

    // 6.6 — refuse to send when the report is not live on the portal. An email
    // whose link 404s is worse than no email: the leader is told a report
    // exists and cannot read it.
    const live = await this.isLive(reportId);
    if (!live) return { delivered: false, refusal: "not-live" };

    // 6.2 at delivery time, against what is already persisted.
    const verdict = await this.governance.check({
      reportId,
      coachId,
      body: JSON.stringify(report.body ?? {}),
      evidence,
    });
    if (!verdict.passed) {
      // Returned to the admin review path, NOT discarded. A blocked report is
      // a report somebody needs to look at, and throwing it away loses the
      // session's work entirely.
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

    const sends: DeliveryResult["sends"] = [];
    for (const to of recipients) {
      const result = (await this.mailer.sendEmail({
        subject,
        to,
        // From is the authenticated sending domain; a Gmail address Mailgun
        // cannot authorize fails SPF/DMARC and lands coaching reports in spam.
        replyTo: { name: COACH_REPLY_TO_NAME, email: COACH_REPLY_TO_EMAIL },
        text: `${subject}\n\n${portalUrlFor(reportId)}`,
        html,
      })) as CoachSendResult | undefined;
      sends.push({
        email: to.email,
        delivered: result?.delivered === true,
        error: result?.error,
      });
    }

    // 6.5 — delivery is complete only when EVERY recipient's send is confirmed.
    // A partial delivery reported as success is how an admin stops seeing a
    // leader's reports without anyone noticing.
    const allSent = sends.length > 0 && sends.every((s) => s.delivered);
    if (!allSent) {
      return { delivered: false, refusal: "send-failed", sends, subject };
    }

    await this.governance.recordEvidence(reportId, evidence);
    await conn
      .updateTable("coach_intake_sessions")
      .set({ state: "delivered", updated_at: sql`NOW()` })
      .where("report_id", "=", reportId)
      .execute();

    return { delivered: true, sends, subject };
  }

  /** Live means a reader can open it: the report row exists and is published. */
  private async isLive(reportId: string): Promise<boolean> {
    const row = await this.db
      .getOrCreateConnection()
      .selectFrom("coach_reports")
      .select("id")
      .where("id", "=", reportId)
      .executeTakeFirst();
    return Boolean(row);
  }

  /**
   * 6.5 — the three-recipient rule: the leader, the benchmark leader, and the
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
