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
  passageBook: t.Union([t.String(), t.Null()]),
  dimensions: t.Array(
    t.Object({
      n: t.Number(),
      score: t.Union([t.Number(), t.Null()]),
      rationale: t.String(),
      provenance: t.String(),
      modelVersion: t.Union([t.String(), t.Null()]),
    }),
  ),
});

const SendsSchema = t.Array(
  t.Object({
    email: t.String(),
    delivered: t.Boolean(),
    error: t.Optional(t.String()),
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
    t.Object({
      revision: t.Number(),
      previous: t.Record(t.String(), t.Unknown()),
      changes: t.Record(t.String(), t.Unknown()),
      amendedBy: t.Union([t.String(), t.Null()]),
      amendedAt: t.Date(),
      sentTo: t.Array(t.String()),
      skipped: t.Array(t.String()),
      sentAt: t.Union([t.Date(), t.Null()]),
    }),
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
      basis: t.String(),
      observedSessions: t.Number(),
      accountStatus: t.String(),
      linkedClassName: t.Union([t.String(), t.Null()]),
      classAlert: t.Boolean(),
      attestedAt: t.Union([t.String(), t.Null()]),
      attestedBy: t.Union([t.String(), t.Null()]),
    }),
  ),
});
