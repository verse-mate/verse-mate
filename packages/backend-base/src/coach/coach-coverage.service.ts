import type { db } from "../shared/shared.plugin";

/**
 * Recording-bot coverage (change: port-coach-pipeline, task 4.7, design D6).
 *
 * With the email path dropped, intake is the only way a session reaches the
 * pipeline, so a leader the bot does not cover silently receives no reports.
 * This is the mechanism that surfaces them, and task 9.1 gates an irreversible
 * step (retiring the host) on it.
 *
 * Coverage is OBSERVATIONAL, and that is a finding rather than a preference:
 * **no provider API returns the bot's configured joins.** The Fireflies public
 * API exposes Users, Transcripts, Transcript, Bites, Analytics, Active Meetings
 * (in-progress only), AI Apps, AskFred, Channels, Contacts, Live Action Items,
 * Rule Executions and Audit Events, nothing that lists upcoming or configured
 * joins. The host's own client (`fireflies_client.py`) has no such query
 * either. So "is this leader covered" can only be answered by what intake has
 * actually seen.
 *
 * Which leaves one case the data cannot settle: a leader who is genuinely not
 * teaching looks exactly like a leader the bot fails to cover, both are
 * silent. That distinction is recorded by a human, explicitly, and never
 * inferred.
 */

export type CoverageBasis =
  | "observed"
  | "attested-not-teaching"
  | "no-observation";

export type AccountStatus = "has-account" | "no-account";

export interface LeaderCoverage {
  coachId: string;
  name: string;
  email: string;
  covered: boolean;
  basis: CoverageBasis;
  /** Sessions intake observed for this leader inside the window. */
  observedSessions: number;
  /**
   * Whether the leader has a VerseMate account at all. A roster leader without
   * one has no `coach_classes` row for reasons that have nothing to do with
   * coverage, and saying so is not the same as saying "no class linked".
   */
  accountStatus: AccountStatus;
  /** A class they registered, carrying a non-empty meeting link. */
  linkedClassName: string | null;
  /**
   * Their registered class disagrees with what intake observed: they entered a
   * meeting link and nothing arrived. Leader-entered INTENT, never proof, the
   * alert asks an admin to check the bot's calendar configuration.
   */
  classAlert: boolean;
}

export interface CoverageReport {
  windowDays: number;
  leaders: LeaderCoverage[];
  uncovered: LeaderCoverage[];
  /** What task 9.1 reads before retiring the host. */
  allCovered: boolean;
}

export class CoachCoverageService {
  constructor(private readonly db: db) {}

  async assess(opts: { windowDays: number }): Promise<CoverageReport> {
    const conn = this.db.getOrCreateConnection();
    const since = new Date(Date.now() - opts.windowDays * 86_400_000);

    const leaders = await conn
      .selectFrom("coach_leaders")
      .select(["slug", "name", "email", "not_teaching_attested_at"])
      .where("slug", "is not", null)
      .where("is_coach", "=", true)
      .orderBy("slug")
      .execute();

    const observations = await conn
      .selectFrom("coach_intake_sessions")
      .select("coach_id")
      .select((eb) => eb.fn.countAll<string>().as("n"))
      .where("coach_id", "is not", null)
      .where("observed_at", ">=", since)
      .groupBy("coach_id")
      .execute();
    const observedByCoach = new Map(
      observations.map((o) => [o.coach_id as string, Number(o.n)]),
    );

    // The join path, stated because it is not obvious: the roster keys on
    // EMAIL, `coach_classes` keys on `user.id`. They meet only through `user`.
    const classRows = await conn
      .selectFrom("coach_classes")
      .innerJoin("user", "user.id", "coach_classes.user_id")
      .select(["user.email as email", "coach_classes.name as name"])
      // notNull().defaultTo(""), the ROW existing proves nothing, only a
      // non-empty link is leader-entered intent.
      .where("coach_classes.zoom_link", "<>", "")
      .execute();
    const classByEmail = new Map(
      classRows.map((c) => [c.email.toLowerCase(), c.name]),
    );

    const accounts = await conn
      .selectFrom("user")
      .select("email")
      .where(
        "email",
        "in",
        leaders.map((l) => l.email),
      )
      .execute();
    const withAccount = new Set(accounts.map((a) => a.email.toLowerCase()));

    const assessed: LeaderCoverage[] = leaders.map((l) => {
      const email = l.email.toLowerCase();
      const observed = observedByCoach.get(l.slug as string) ?? 0;
      const attested = Boolean(l.not_teaching_attested_at);
      const covered = observed > 0 || attested;
      const linkedClassName = classByEmail.get(email) ?? null;
      return {
        coachId: l.slug as string,
        name: l.name,
        email: l.email,
        covered,
        basis:
          observed > 0
            ? "observed"
            : attested
              ? "attested-not-teaching"
              : "no-observation",
        observedSessions: observed,
        accountStatus: withAccount.has(email) ? "has-account" : "no-account",
        linkedClassName,
        classAlert: linkedClassName !== null && observed === 0 && !attested,
      };
    });

    const uncovered = assessed.filter((l) => !l.covered);
    return {
      windowDays: opts.windowDays,
      leaders: assessed,
      uncovered,
      allCovered: uncovered.length === 0,
    };
  }
}
