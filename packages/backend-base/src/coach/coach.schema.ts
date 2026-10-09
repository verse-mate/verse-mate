import { t } from "elysia";

// ─── Coach response schemas ────────────────────────────────────────────────
//
// Pure TypeBox schemas for the /coach/* responses, kept in a side-effect-free
// module (no Redis/db imports) so they can be unit-tested directly. Elysia
// strips any response property NOT declared here, so these schemas are the
// contract that decides what actually reaches the portal.

export const ClusterSchema = t.Object({
  name: t.String(),
  weight: t.Number(),
  scorePct: t.Union([t.Number(), t.Null()]),
  contribution: t.Number(),
});

export const DimensionSchema = t.Object({
  n: t.Number(),
  name: t.String(),
  score: t.Union([t.Number(), t.Null()]),
  note: t.Optional(t.String()),
});

// One fully-written coaching point (heading + prose paragraphs) emitted by the
// pipeline for the desktop view. Must be declared so Elysia doesn't strip the
// prose from the response before it reaches the portal.
export const FeedbackPointSchema = t.Object({
  title: t.String(),
  paragraphs: t.Array(t.String()),
});

// A timestamped moment inside a report section (e.g. a Key Moment or a Session
// Flow Timeline entry). `timestamp` is a display string ("[50:03]"), optional.
export const MomentSchema = t.Object({
  timestamp: t.Optional(t.String()),
  detail: t.String(),
});

// A generic, ordered report section (Key Moments, Session Flow Timeline,
// Vulnerability Moments, Question Classification, Score Composition, …). Any
// mix of paragraphs, bullets, and timestamped moments. Declared so Elysia
// passes `report.sections` through instead of stripping it.
export const SectionSchema = t.Object({
  title: t.String(),
  paragraphs: t.Optional(t.Array(t.String())),
  bullets: t.Optional(t.Array(t.String())),
  moments: t.Optional(t.Array(MomentSchema)),
});

// One registered class. `classDate` is an ISO yyyy-mm-dd string or null (no
// pinned date). `zoomLink` is the URL the Notetaker bot joins.
export const CoachClassSchema = t.Object({
  id: t.String(),
  name: t.String(),
  classDate: t.Union([t.String(), t.Null()]),
  recurrence: t.String(),
  zoomLink: t.String(),
});

// One class in the admin export, the class fields plus the leader it belongs
// to (name / email / roster id) so the Fireflies operator can map each meeting
// link to a coach without a second lookup.
export const AdminCoachClassSchema = t.Object({
  id: t.String(),
  name: t.String(),
  classDate: t.Union([t.String(), t.Null()]),
  recurrence: t.String(),
  zoomLink: t.String(),
  leader: t.Object({
    id: t.Union([t.String(), t.Null()]),
    name: t.String(),
    email: t.String(),
  }),
});

// A coaching note as returned to the portal. Declared so Elysia passes
// `report.notes` through instead of stripping it.
export const NoteSchema = t.Object({
  id: t.String(),
  body: t.String(),
  createdAt: t.String(),
  emailed: t.Boolean(),
});

export const ReportSchema = t.Object({
  id: t.String(),
  date: t.String(),
  dateLabel: t.String(),
  session: t.String(),
  topic: t.String(),
  duration: t.String(),
  attendees: t.Number(),
  newcomers: t.Number(),
  score: t.Number(),
  base: t.Number(),
  newcomerBonus: t.Number(),
  sizeBonus: t.Number(),
  status: t.String(),
  statusEmoji: t.String(),
  clusters: t.Array(ClusterSchema),
  dimensions: t.Array(DimensionSchema),
  bigIdeas: t.Array(t.String()),
  feedback: t.Object({
    headline: t.String(),
    strengths: t.Array(t.String()),
    improvements: t.Array(t.String()),
    recommendations: t.Array(t.String()),
    // NEW, long-form prose (desktop). Optional so pre-prose reports validate.
    overview: t.Optional(t.Array(t.String())),
    strengthsProse: t.Optional(t.Array(FeedbackPointSchema)),
    improvementsProse: t.Optional(t.Array(FeedbackPointSchema)),
    recommendationsProse: t.Optional(t.Array(FeedbackPointSchema)),
  }),
  // Ordered PDF-parity sections rendered after Recommendations. Optional so
  // reports generated before this feature still validate.
  sections: t.Optional(t.Array(SectionSchema)),
  docUrl: t.Optional(t.String()),
  pdfUrl: t.Optional(t.String()),
  // Admin-editable recording URL + coaching notes, overlaid from the DB.
  // Optional so bundled reports without them still validate.
  recordingUrl: t.Optional(t.String()),
  attachedRecordingUrl: t.Optional(t.Union([t.String(), t.Null()])),
  // DETAIL-ONLY (task 4.5). Says whether VerseMate holds a recording, never
  // where it is, the address is minted per session by
  // GET /coach/reports/:reportId/recording-url. Kept off `recordingUrl`
  // because that field is overlaid onto every row of every list, so carrying
  // an address here would sign one URL per session on each page load.
  hasRetainedRecording: t.Optional(t.Boolean()),
  notes: t.Optional(t.Array(NoteSchema)),
});

// ─── Monthly cross-leader analysis ─────────────────────────────────────────

export const MonthlyLeaderSchema = t.Object({
  id: t.String(),
  name: t.String(),
  group: t.String(),
  sessions: t.Number(),
  avgScore: t.Union([t.Number(), t.Null()]),
  status: t.String(),
  statusEmoji: t.String(),
  dimensions: t.Array(
    t.Object({
      n: t.Number(),
      name: t.String(),
      avg: t.Union([t.Number(), t.Null()]),
    }),
  ),
  delta: t.Union([t.Number(), t.Null()]),
});

export const MonthlySchema = t.Object({
  month: t.String(),
  monthLabel: t.String(),
  program: t.Object({
    sessions: t.Number(),
    activeLeaders: t.Number(),
    newcomers: t.Number(),
    avgScore: t.Union([t.Number(), t.Null()]),
    clusters: t.Array(
      t.Object({
        name: t.String(),
        weight: t.Number(),
        avg: t.Union([t.Number(), t.Null()]),
      }),
    ),
    delta: t.Union([t.Number(), t.Null()]),
  }),
  leaders: t.Array(MonthlyLeaderSchema),
  // Months (YYYY-MM) that actually have reports, newest first, drives the
  // portal's month picker so only completed months are selectable.
  availableMonths: t.Array(t.String()),
  // Program-wide narrative prose for the month (Executive Summary + Trends),
  // or null. Passed through from the coaching pipeline's shared generator.
  narrative: t.Union([
    t.Object({
      executiveSummary: t.Array(t.String()),
      trends: t.Array(t.String()),
    }),
    t.Null(),
  ]),
});

// ─── Per-leader monthly summary (full parity with the individual monthly PDF)

const NumOrNull = t.Union([t.Number(), t.Null()]);
const DimStat = t.Union([
  t.Object({ name: t.String(), val: t.Number() }),
  t.Null(),
]);

export const LeaderMonthlySummarySchema = t.Object({
  month: t.String(),
  monthLabel: t.String(),
  priorMonthLabel: t.String(),
  leaderId: t.String(),
  leaderName: t.String(),
  group: t.String(),
  sessionsCount: t.Number(),
  composite: t.Number(),
  status: t.Object({ label: t.String(), emoji: t.String() }),
  priorComposite: NumOrNull,
  delta: NumOrNull,
  clusterAvg: t.Object({
    tc: NumOrNull,
    bm: NumOrNull,
    ep: NumOrNull,
    br: NumOrNull,
  }),
  glance: t.Object({
    rows: t.Array(
      t.Object({
        date: t.String(),
        session: t.String(),
        bm: NumOrNull,
        tc: NumOrNull,
        ep: NumOrNull,
        br: NumOrNull,
        composite: t.Number(),
        status: t.String(),
      }),
    ),
    avg: t.Object({
      bm: NumOrNull,
      tc: NumOrNull,
      ep: NumOrNull,
      br: NumOrNull,
      composite: t.Number(),
      status: t.String(),
    }),
  }),
  trajectory: t.Array(
    t.Object({
      date: t.String(),
      session: t.String(),
      composite: t.Number(),
      status: t.String(),
      delta: NumOrNull,
    }),
  ),
  clusters: t.Array(
    t.Object({
      key: t.String(),
      name: t.String(),
      weight: t.Number(),
      avgPct: NumOrNull,
      statusLabel: t.String(),
      strongestDim: DimStat,
      weakestDim: DimStat,
      insight: t.String(),
    }),
  ),
  strengths: t.Array(t.Object({ text: t.String(), session: t.String() })),
  growth: t.Array(t.Object({ text: t.String(), session: t.String() })),
  trends: t.Array(t.String()),
  conversationGuide: t.Array(t.Object({ label: t.String(), q: t.String() })),
  focus: t.Object({
    clusterName: t.String(),
    clusterPct: NumOrNull,
    goals: t.Array(t.String()),
  }),
  sessions: t.Array(
    t.Object({
      date: t.String(),
      session: t.String(),
      composite: t.Number(),
      status: t.String(),
      dimensions: t.Array(
        t.Object({
          n: t.Number(),
          name: t.String(),
          cluster: t.String(),
          score: NumOrNull,
          note: t.String(),
        }),
      ),
    }),
  ),
});

export const LeaderMonthlyResponseSchema = t.Object({
  profile: t.Object({ id: t.String(), name: t.String(), group: t.String() }),
  summary: t.Union([LeaderMonthlySummarySchema, t.Null()]),
  availableMonths: t.Array(t.String()),
});

/**
 * The rubric contract served by GET /coach/rubric. Every field exists because a
 * portal surface needs it: cluster names and weights for the breakdown,
 * dimension -> cluster with each explainer and research-backed target for the
 * expandable dimension detail, and BOTH band scales, composite status and the
 * 1-5 dimension labels, so no client keeps its own list.
 */
export const RubricContractSchema = t.Object({
  model: t.String(),
  clusters: t.Array(t.Object({ name: t.String(), weight: t.Number() })),
  dimensions: t.Array(
    t.Object({
      n: t.Number(),
      name: t.String(),
      cluster: t.String(),
      clusterWeight: t.Number(),
      what: t.String(),
      target: t.String(),
    }),
  ),
  statusBands: t.Array(
    t.Object({ min: t.Number(), label: t.String(), emoji: t.String() }),
  ),
  dimensionBands: t.Array(t.Object({ min: t.Number(), label: t.String() })),
});

/** What an admin sees reviewing a report's dimension scores (task 5.7). */
export const ReviewStateSchema = t.Object({
  reportId: t.String(),
  delivered: t.Boolean(),
  base: t.Number(),
  humanCorrected: t.Boolean(),
  firstLesson: t.Boolean(),
  firstLessonSource: t.Union([t.String(), t.Null()]),
  firstLessonLine: t.Union([t.String(), t.Null()]),
  parallelRun: t.Boolean(),
  dimensions: t.Array(
    t.Object({
      n: t.Number(),
      score: t.Union([t.Number(), t.Null()]),
      rationale: t.String(),
      provenance: t.String(),
      modelVersion: t.Union([t.String(), t.Null()]),
      languageModel: t.Union([t.String(), t.Null()]),
      promptVersion: t.Union([t.String(), t.Null()]),
      settings: t.Union([
        t.Object({
          temperature: t.Union([t.Number(), t.Null()]),
          reasoningEffort: t.Union([t.String(), t.Null()]),
        }),
        t.Null(),
      ]),
    }),
  ),
});

const SendsSchema = t.Array(
  t.Object({
    email: t.String(),
    delivered: t.Boolean(),
    error: t.Optional(t.String()),
    neverConfirmed: t.Optional(t.Literal(true)),
  }),
);

export const RevisionResultSchema = t.Object({
  applied: t.Boolean(),
  refusal: t.Optional(t.String()),
  violations: t.Optional(t.Array(t.String())),
  coldRecall: t.Optional(t.Array(t.String())),
  revision: t.Optional(t.Number()),
  firstLesson: t.Optional(t.Boolean()),
  base: t.Optional(t.Number()),
  score: t.Optional(t.Number()),
  status: t.Optional(t.String()),
  sent: t.Optional(t.Boolean()),
  pending: t.Optional(t.String()),
  sends: t.Optional(SendsSchema),
  skipped: t.Optional(t.Array(t.String())),
});

const AmendedProseSchema = t.Array(
  t.Object({
    title: t.String({ maxLength: 500 }),
    paragraphs: t.Array(t.String({ maxLength: 4000 }), { maxItems: 10 }),
  }),
  { maxItems: 10 },
);

export const ImprovementsEditBodySchema = t.Object({
  improvements: t.Array(t.String({ maxLength: 4000 }), { maxItems: 10 }),
  improvementsProse: t.Optional(AmendedProseSchema),
});

export const BigIdeasReviewRowSchema = t.Object({
  value: t.String({ maxLength: 200 }),
  rating: t.Union([
    t.Literal("STRONG"),
    t.Literal("ON TARGET"),
    t.Literal("NEEDS WORK"),
    t.Literal("N/A"),
  ]),
});

export const AmendmentBodySchema = t.Object({
  dimensions: t.Optional(
    t.Array(
      t.Object({
        n: t.Integer({ minimum: 1, maximum: 12 }),
        score: t.Union([t.Integer({ minimum: 1, maximum: 5 }), t.Null()]),
        rationale: t.String({ maxLength: 4000 }),
      }),
      { maxItems: 12 },
    ),
  ),
  firstLesson: t.Optional(t.Boolean()),
  bigIdeasReview: t.Optional(BigIdeasReviewRowSchema),
  body: t.Optional(
    t.Object({
      headline: t.Optional(t.String({ maxLength: 500 })),
      overview: t.Optional(
        t.Array(t.String({ maxLength: 4000 }), { maxItems: 10 }),
      ),
      strengths: t.Optional(
        t.Array(t.String({ maxLength: 4000 }), { maxItems: 10 }),
      ),
      improvements: t.Optional(
        t.Array(t.String({ maxLength: 4000 }), { maxItems: 10 }),
      ),
      recommendations: t.Optional(
        t.Array(t.String({ maxLength: 4000 }), { maxItems: 10 }),
      ),
      strengthsProse: t.Optional(AmendedProseSchema),
      improvementsProse: t.Optional(AmendedProseSchema),
      recommendationsProse: t.Optional(AmendedProseSchema),
    }),
  ),
});

export const RevisionSendSchema = t.Object({
  sent: t.Boolean(),
  refusal: t.Optional(t.String()),
  revision: t.Optional(t.Number()),
  sends: t.Optional(SendsSchema),
  skipped: t.Optional(t.Array(t.String())),
});

export const RevisionsSchema = t.Object({
  revisions: t.Array(
    t.Union([
      t.Object({
        kind: t.Literal("revision"),
        revision: t.Number(),
        previous: t.Record(t.String(), t.Unknown()),
        changes: t.Record(t.String(), t.Unknown()),
        amendedBy: t.Union([t.String(), t.Null()]),
        amendedAt: t.Date(),
        sentTo: t.Array(t.String()),
        skipped: t.Array(t.String()),
        sentAt: t.Union([t.Date(), t.Null()]),
        attemptedTo: t.Array(t.String()),
      }),
      t.Object({
        kind: t.Literal("edit"),
        edit: t.Number(),
        changes: t.Record(t.String(), t.Unknown()),
        editedBy: t.Union([t.String(), t.Null()]),
        editedAt: t.Date(),
      }),
    ]),
  ),
});

/** Recording-bot coverage across the roster (task 4.7; the 9.1 gate). */
export const CoverageReportSchema = t.Object({
  windowDays: t.Number(),
  allCovered: t.Boolean(),
  leaders: t.Array(
    t.Object({
      coachId: t.String(),
      name: t.String(),
      email: t.String(),
      covered: t.Boolean(),
      basis: t.Union([
        t.Literal("observed"),
        t.Literal("rotating-class"),
        t.Literal("attested-not-teaching"),
        t.Literal("attestation-lapsed"),
        t.Literal("no-observation"),
      ]),
      observedSessions: t.Number(),
      accountStatus: t.String(),
      linkedClassName: t.Union([t.String(), t.Null()]),
      classAlert: t.Boolean(),
      attestedAt: t.Union([t.String(), t.Null()]),
      attestedBy: t.Union([t.String(), t.Null()]),
    }),
  ),
});

const ComparedDimensionSchema = t.Object({
  n: t.Number(),
  host: t.Union([t.Number(), t.Null()]),
  backend: t.Union([t.Number(), t.Null()]),
  difference: t.Union([t.Number(), t.Null()]),
});

const SessionRefSchema = t.Object({
  sourceSessionId: t.String(),
  reportId: t.String(),
});

export const ParallelRunComparisonSchema = t.Object({
  sessions: t.Array(
    t.Object({
      coachId: t.String(),
      date: t.String(),
      backend: t.Object({
        sourceSessionId: t.String(),
        reportId: t.String(),
        composite: t.Number(),
      }),
      host: t.Object({
        reportId: t.String(),
        composite: t.Union([t.Number(), t.Null()]),
      }),
      compositeDifference: t.Union([t.Number(), t.Null()]),
      dimensions: t.Array(ComparedDimensionSchema),
      withinOne: t.Number(),
      comparable: t.Number(),
      flagged: t.Boolean(),
    }),
  ),
  needsPairing: t.Array(
    t.Object({
      coachId: t.String(),
      date: t.String(),
      backend: t.Array(SessionRefSchema),
      host: t.Array(t.Object({ reportId: t.String() })),
    }),
  ),
  unmatched: t.Object({
    backend: t.Array(
      t.Object({
        coachId: t.String(),
        date: t.String(),
        sourceSessionId: t.String(),
        reportId: t.String(),
      }),
    ),
    host: t.Array(
      t.Object({ coachId: t.String(), date: t.String(), reportId: t.String() }),
    ),
  }),
  share: t.Object({
    withinOne: t.Number(),
    comparable: t.Number(),
    ratio: t.Union([t.Number(), t.Null()]),
  }),
  counts: t.Object({
    compared: t.Number(),
    flagged: t.Number(),
    needsPairing: t.Number(),
    unmatchedBackend: t.Number(),
    unmatchedHost: t.Number(),
  }),
});

export const AddressChangeDescriptionSchema = t.Union([
  t.Object({
    leaderName: t.String(),
    newEmail: t.String(),
    state: t.Literal("pending"),
    expiresAt: t.String(),
  }),
  t.Object({
    state: t.Union([
      t.Literal("expired"),
      t.Literal("confirmed"),
      t.Literal("superseded"),
      t.Literal("refused"),
    ]),
    expiresAt: t.String(),
  }),
]);

export const EMAIL_RULE =
  "Enter one email address: letters, digits and . _ % + - before the @, then a domain such as example.org, with no trailing dot";

const PARALLEL_RUN_SESSION =
  "This session was observed during the parallel run: it is kept for admin comparison and never sent";

const PARALLEL_RUN =
  "The pipeline is in its parallel run: nothing is sent until cutover";

const NO_MAILER = "No mailer is configured";

export interface CoachRefusal {
  status: 400 | 404 | 409;
  message: string;
  template?: true;
}

const refusal = (status: CoachRefusal["status"], message: string) => ({
  status,
  message,
});

const template = (status: CoachRefusal["status"], message: string) => ({
  status,
  message,
  template: true as const,
});

const REPORT_EDIT = {
  "legacy-report": refusal(
    409,
    "Refused: this is a legacy report, which is read-only. Change it at its source and it arrives through the backfill.",
  ),
  "unknown-report": refusal(404, "No scores for that report"),
  "not-delivered": refusal(
    409,
    "Refused: the report is not delivered yet. Correct it through the review instead.",
  ),
  "unknown-dimension": refusal(400, "Unknown dimension"),
  "score-out-of-range": refusal(400, "A dimension score is 1 to 5, or null"),
  "memory-reinforcement-required": refusal(
    400,
    "Clearing the first-lesson flag needs a Memory Reinforcement score and rationale",
  ),
  "big-ideas-review-required": refusal(
    400,
    "Clearing the first-lesson flag needs the scorecard's Big Ideas review at open row: its value and a rating of STRONG, ON TARGET, NEEDS WORK or N/A",
  ),
  "empty-amendment": refusal(400, "The amendment changes nothing"),
  "empty-edit": refusal(
    400,
    "The edit changes nothing: give at least one improvement, different from the current ones",
  ),
  "in-flight": refusal(
    409,
    "Refused: the report is being delivered or re-scored. Correct it once that finishes, or amend it after delivery.",
  ),
  "revision-sending": refusal(
    409,
    "Refused: a revised copy of this report is being sent right now. Amend it again once that send finishes.",
  ),
  "partially-delivered": refusal(
    409,
    "Refused: the report is already open to its leader, or already emailed to some of its recipients, so it can no longer be corrected or edited. Its remaining sends are retried automatically. If one keeps failing, or a recipient has only a placeholder address, fix that recipient's address and requeue the report from the pipeline failures list. Once every recipient has it, amend it.",
  ),
  "already-delivered": refusal(
    409,
    "Refused: the report was already delivered. Amend it instead, which sends the leader a revised copy.",
  ),
};

const pick = <K extends keyof typeof REPORT_EDIT>(...codes: K[]) =>
  Object.fromEntries(codes.map((c) => [c, REPORT_EDIT[c]])) as Pick<
    typeof REPORT_EDIT,
    K
  >;

const UNKNOWN_LEADER = { "unknown-leader": refusal(404, "Leader not found") };
const INVALID_MONTH = {
  "invalid-month": refusal(400, "month must be YYYY-MM"),
};

const ROTATING_CLASS = {
  "invalid-address": refusal(400, EMAIL_RULE),
  "address-in-use": refusal(
    409,
    "That address is a leader's own address or another rotating class's group address",
  ),
  "no-leaders": refusal(400, "Name at least one roster leader who takes turns"),
  ...UNKNOWN_LEADER,
};

export const COACH_REFUSALS = {
  "POST /coach/admin/rotating-classes": ROTATING_CLASS,
  "PUT /coach/admin/rotating-classes/:id": {
    ...ROTATING_CLASS,
    "unknown-class": refusal(404, "Rotating class not found"),
  },
  "PUT /coach/admin/leaders/:id/rotating-only": UNKNOWN_LEADER,
  "GET /coach/admin/reports/:reportId/review": pick("unknown-report"),
  "POST /coach/admin/reports/:reportId/dimensions/:dimensionN": {
    "invalid-dimension": refusal(400, "A dimension is a whole number, 1 to 12"),
    ...pick(
      "legacy-report",
      "unknown-report",
      "unknown-dimension",
      "score-out-of-range",
      "memory-reinforcement-required",
      "in-flight",
      "partially-delivered",
      "already-delivered",
    ),
  },
  "PUT /coach/admin/reports/:reportId/first-lesson": pick(
    "legacy-report",
    "unknown-report",
    "score-out-of-range",
    "memory-reinforcement-required",
    "big-ideas-review-required",
    "in-flight",
    "partially-delivered",
    "already-delivered",
  ),
  "PUT /coach/admin/reports/:reportId/improvements": pick(
    "legacy-report",
    "unknown-report",
    "empty-edit",
    "in-flight",
    "partially-delivered",
    "already-delivered",
  ),
  "POST /coach/admin/reports/:reportId/amend": pick(
    "legacy-report",
    "unknown-report",
    "not-delivered",
    "empty-amendment",
    "unknown-dimension",
    "score-out-of-range",
    "memory-reinforcement-required",
    "big-ideas-review-required",
    "revision-sending",
  ),
  "POST /coach/admin/reports/:reportId/revision/send": {
    "no-revision": refusal(404, "That report has no revision"),
    "already-sent": refusal(409, "The latest revision was already sent"),
    "in-flight": refusal(409, "The revision is being sent by another request"),
    "no-mailer": refusal(409, NO_MAILER),
    "parallel-run": refusal(409, PARALLEL_RUN),
    "not-live": refusal(
      409,
      "The report is not live for the leader this revision was made for: it is held, not delivered, or re-attributed",
    ),
  },
  "POST /coach/admin/reports/:reportId/revision/requeue": {
    "nothing-to-requeue": refusal(
      404,
      "That report has no unsent revision with a send left unconfirmed, or its send is still in flight",
    ),
  },
  "POST /coach/admin/leaders/:id/not-teaching": UNKNOWN_LEADER,
  "DELETE /coach/admin/leaders/:id/not-teaching": UNKNOWN_LEADER,
  "POST /coach/admin/reports/:reportId/release": {
    "not-held": refusal(404, "No report held for review"),
    "parallel-run-session": refusal(409, PARALLEL_RUN_SESSION),
    "no-mailer": refusal(409, NO_MAILER),
    "parallel-run": refusal(409, PARALLEL_RUN),
  },
  "POST /coach/admin/pipeline-failures/:sourceSessionId/requeue": {
    "parallel-run-session": refusal(409, PARALLEL_RUN_SESSION),
    "not-parked": refusal(404, "No parked session"),
  },
  "POST /coach/admin/reshares/:sourceSessionId/send": {
    "parallel-run": refusal(409, PARALLEL_RUN),
    "parallel-run-session": refusal(409, PARALLEL_RUN_SESSION),
    "unknown-session": refusal(404, "Session not found"),
    "not-pending": refusal(
      409,
      "This session has no pending re-share request: its recording was retrieved, or retrieval has not run out of attempts",
    ),
    "already-asked": refusal(
      409,
      "The leader was already asked to re-share this recording",
    ),
    "no-leader-address": refusal(
      409,
      "The session's leader has no address on the roster",
    ),
    "placeholder-address": refusal(
      409,
      "The session's leader has only a placeholder address: set their real address first",
    ),
    "group-address": refusal(
      409,
      "The session's leader has only their rotating class's group address, which is never sent to: set their own address first",
    ),
    "send-failed": refusal(
      400,
      "The mail service did not accept the request: try again",
    ),
  },
  "POST /coach/admin/reshares/:sourceSessionId/resolve": {
    "not-pending": refusal(404, "No pending re-share request"),
  },
  "GET /coach/admin/coaches/:id/reports/summary": {
    "unknown-leader": refusal(404, "Coach not found"),
  },
  "GET /coach/admin/coaches/:id/reports/:reportId": {
    "unknown-report": refusal(404, "Session not found"),
  },
  "GET /coach/admin/coaches/:id/trends": {
    "unknown-leader": refusal(404, "Coach not found"),
  },
  "GET /coach/admin/coaches/:id/monthly-summary": {
    ...INVALID_MONTH,
    "unknown-leader": refusal(404, "Coach not found"),
  },
  "POST /coach/admin/leaders": {
    "invalid-address": refusal(400, EMAIL_RULE),
    "slug-taken": template(
      409,
      'Another leader already uses the id "<slug>". Enter a different name.',
    ),
    "no-slug": refusal(400, "Enter a name with at least one letter or digit"),
    "keyword-conflict": template(
      409,
      'Name refused: it contains "<keyword>", a keyword of <leader>. Their sessions would be routed to that leader. Enter a different name or change that leader\'s keywords first.',
    ),
    "email-taken": refusal(409, "That email is already a leader"),
    "group-address": refusal(
      409,
      "That is a rotating class's group address, which is never a leader's own address",
    ),
  },
  "GET /coach/admin/leaders/:id/attribution": UNKNOWN_LEADER,
  "PUT /coach/admin/leaders/:id/attribution": {
    "keyword-too-short": refusal(
      400,
      "Each title keyword needs at least three characters",
    ),
    "invalid-alternate-address": template(
      400,
      `Alternate address "<address>": ${EMAIL_RULE}`,
    ),
    "keyword-conflict": template(
      409,
      'Keywords refused: "<keyword>" is inside the name of <leader>; "<keyword>" is inside a keyword of <leader>',
    ),
    ...UNKNOWN_LEADER,
  },
  "POST /coach/confirm-address/describe": {
    "invalid-link": refusal(404, "This confirmation link is not valid"),
  },
  "POST /coach/confirm-address": {
    "invalid-link": refusal(404, "This confirmation link is not valid"),
    expired: refusal(
      409,
      "This confirmation link has expired. Ask your program admin to send a new one.",
    ),
    superseded: refusal(
      409,
      "A newer address change replaced this one. Use the most recent confirmation email.",
    ),
    "already-confirmed": refusal(
      409,
      "This address change was already confirmed",
    ),
    taken: refusal(
      409,
      "Another leader already uses that address, so the change was not made. Your program admin has been shown why.",
    ),
  },
  "PUT /coach/admin/leaders/:id/email": {
    "invalid-address": refusal(400, EMAIL_RULE),
    taken: refusal(409, "Another leader already uses that address"),
    "group-address": refusal(
      409,
      "That is a rotating class's group address, which is never a leader's own address",
    ),
    "confirm-required": refusal(
      409,
      "This is the benchmark leader, whose address receives every leader's reports: send confirm: true to change it",
    ),
    ...UNKNOWN_LEADER,
  },
  "POST /coach/admin/sessions/:sourceSessionId/attribute": {
    ...UNKNOWN_LEADER,
    "unknown-session": refusal(404, "Session not found"),
    "attribution-changed": refusal(
      409,
      "The session's leader changed since this list was loaded; reload it and assign again",
    ),
    "already-assigned": refusal(
      409,
      "The session is already assigned to that leader",
    ),
    "in-flight": refusal(
      409,
      "The session's report is being delivered right now; try again shortly",
    ),
  },
  "PUT /coach/admin/coaches/:id/reports/:reportId/recording": {
    "invalid-link": refusal(400, "Enter a valid http(s) link"),
    "unknown-report": refusal(404, "Session not found"),
  },
  "POST /coach/admin/coaches/:id/reports/:reportId/notes": {
    "empty-note": refusal(400, "Note cannot be empty"),
    "unknown-report": refusal(404, "Session not found"),
    held: refusal(
      409,
      "This report is held from its leader, so a note would email them about a report they cannot open. Release it first.",
    ),
  },
  "GET /coach/admin/monthly": INVALID_MONTH,
} satisfies Record<string, Record<string, CoachRefusal>>;

export type CoachRefusalRoute = keyof typeof COACH_REFUSALS;

export const RotatingClassSchema = t.Object({
  id: t.Number(),
  name: t.String(),
  groupEmail: t.String(),
  titleMatch: t.Array(t.String()),
  leaders: t.Array(
    t.Object({ id: t.String(), name: t.String(), rotatingOnly: t.Boolean() }),
  ),
});

export const RotatingClassBodySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  groupEmail: t.String({ maxLength: 254 }),
  titleMatch: t.Array(t.String({ minLength: 3, maxLength: 100 }), {
    maxItems: 50,
  }),
  leaders: t.Array(t.String({ maxLength: 200 }), { maxItems: 50 }),
});
