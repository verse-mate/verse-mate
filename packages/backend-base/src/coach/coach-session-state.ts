import type Database from "database/src/models/Database";
import { type Expression, type ExpressionBuilder, sql } from "kysely";
import { VISUAL_AIDS_DIMENSION } from "./rubric";

export const SESSION_STATES = [
  "observed",
  "held",
  "retrieval_failed",
  "retained",
  "scored",
  "delivered",
  "scoring_failed",
  "delivery_pending",
  "delivering",
  "delivery_failed",
] as const;

export type SessionState = (typeof SESSION_STATES)[number];

export const HOLD_KINDS = [
  "review",
  "reattributed",
  "governance",
  "cold-recall",
  "no-mailer",
  "send-failed",
  "scoring-version",
] as const;

export type HoldKind = (typeof HOLD_KINDS)[number];

const WAITING_ON_A_PERSON: readonly HoldKind[] = [
  "review",
  "governance",
  "cold-recall",
  "no-mailer",
  "scoring-version",
];

export const waitingOnAPersonLast = sql<boolean>`COALESCE(hold_kind IN (${sql.join(
  WAITING_ON_A_PERSON.map((k) => sql.lit(k)),
)}), false)`;

export const STALE_DELIVERY_CLAIM = sql<Date>`NOW() - interval '15 minutes'`;

type Sessions = ExpressionBuilder<Database, "coach_intake_sessions">;

const CORRECTABLE_STATES: readonly string[] = [
  "scored",
  "delivery_pending",
  "delivery_failed",
];

const RESCORABLE_STATES: readonly string[] = [
  "scored",
  "scoring_failed",
  "delivery_pending",
  "delivery_failed",
  "delivered",
];

export function correctable(state: string): boolean {
  return CORRECTABLE_STATES.includes(state);
}

export function rescorable(state: string): boolean {
  return RESCORABLE_STATES.includes(state);
}

export function shownToAnyone(session: {
  published: boolean;
  deliveredTo: string[];
  attemptedTo: string[];
  sendUnconfirmed: boolean;
}): boolean {
  return (
    session.published ||
    session.sendUnconfirmed ||
    session.deliveredTo.length > 0 ||
    session.attemptedTo.length > 0
  );
}

export const abandonedClaim = (eb: Sessions) =>
  eb.and([
    eb("state", "=", "delivering"),
    eb("updated_at", "<", STALE_DELIVERY_CLAIM),
  ]);

export const scorable = (eb: Sessions) =>
  eb.and([eb("state", "=", "retained"), eb("coach_id", "is not", null)]);

const notHeldForItsVersion = (eb: Sessions) =>
  eb.or([
    eb("hold_kind", "is", null),
    eb("hold_kind", "!=", "scoring-version"),
  ]);

export const claimable = (eb: Sessions) =>
  eb.and([
    eb("release_required", "=", false),
    eb("parallel_run", "=", false),
    notHeldForItsVersion(eb),
    eb.or([
      eb("state", "in", ["scored", "delivery_pending"]),
      abandonedClaim(eb),
    ]),
  ]);

export const redeliverable = (eb: Sessions) =>
  eb.and([
    eb("report_id", "is not", null),
    eb("parallel_run", "=", false),
    notHeldForItsVersion(eb),
    eb.or([eb("state", "=", "delivery_pending"), abandonedClaim(eb)]),
  ]);

export const unsentAfterPublish = (eb: Sessions) =>
  eb.and([
    eb("report_id", "is not", null),
    eb.or([
      eb("state", "=", "delivering"),
      eb.and([eb("state", "=", "scored"), eb("hold_kind", "is", null)]),
    ]),
  ]);

export const releasable = (eb: Sessions) =>
  eb.or([
    eb("state", "=", "scored"),
    eb.and([
      eb("release_required", "=", true),
      eb("state", "in", ["delivery_pending", "delivery_failed"]),
    ]),
  ]);

export const requeuable = (eb: Sessions) =>
  eb.or([
    eb("state", "=", "scoring_failed"),
    eb.and([
      eb("state", "=", "delivery_failed"),
      eb("parallel_run", "=", false),
    ]),
  ]);

export const SKIPPED_LEADER_ADDRESS = sql<string | null>`(
  SELECT l.email FROM coach_leaders l
  WHERE l.slug = coach_intake_sessions.coach_id
    AND l.email = ANY(coach_intake_sessions.skipped_recipients)
)`;

export const COLD_RECALL_FEEDBACK = sql<unknown>`(
  SELECT r.body->'feedback' FROM coach_reports r
  WHERE r.id = coach_intake_sessions.report_id
    AND coach_intake_sessions.hold_kind = 'cold-recall'
)`;

export const stuck = (eb: Sessions) =>
  eb.or([
    eb("state", "in", [
      "scoring_failed",
      "delivery_pending",
      "delivery_failed",
    ]),
    eb.and([
      eb("state", "=", "scored"),
      eb.or([
        eb("hold_kind", "is not", null),
        eb("release_required", "=", true),
      ]),
    ]),
    eb("coach_id", "is", null),
    eb.and([
      eb("state", "=", "delivered"),
      eb(SKIPPED_LEADER_ADDRESS, "is not", null),
    ]),
  ]);

export const scoringVersionOf = (reportId: Expression<unknown>) => sql<unknown>`(
  SELECT CASE
    WHEN COUNT(DISTINCT s.language_model) FILTER (WHERE s.dimension_n <> ${sql.lit(VISUAL_AIDS_DIMENSION)}) = 1
     AND COUNT(DISTINCT s.prompt_version) = 1
     AND COUNT(DISTINCT s.generation_settings) = 1
    THEN jsonb_build_object(
      'languageModel', MIN(s.language_model) FILTER (WHERE s.dimension_n <> ${sql.lit(VISUAL_AIDS_DIMENSION)}),
      'promptVersion', MIN(s.prompt_version),
      'settings', MIN(s.generation_settings::text)::jsonb,
      'visionModel', MIN(s.language_model) FILTER (WHERE s.dimension_n = ${sql.lit(VISUAL_AIDS_DIMENSION)})
    )
  END
  FROM coach_report_dimension_scores s
  WHERE s.report_id = ${reportId}
)`;

export const scoringVersionLiteral = (version: {
  languageModel: string;
  promptVersion: string;
  settings: unknown;
  visionModel?: string;
}) =>
  sql<unknown>`${JSON.stringify({
    languageModel: version.languageModel,
    promptVersion: version.promptVersion,
    settings: version.settings,
    visionModel: version.visionModel ?? null,
  })}::jsonb`;

export const versionDeliveredToLeader = (
  coachId: Expression<unknown>,
  version: Expression<unknown>,
) => sql<boolean>`EXISTS (
  SELECT 1 FROM coach_intake_sessions delivered
  WHERE delivered.coach_id = ${coachId}
    AND delivered.state = 'delivered'
    AND ${scoringVersionOf(sql.ref("delivered.report_id"))} = ${version}
)`;

export const VERSION_DELIVERED_TO_LEADER = versionDeliveredToLeader(
  sql.ref("coach_intake_sessions.coach_id"),
  scoringVersionOf(sql.ref("coach_intake_sessions.report_id")),
);
