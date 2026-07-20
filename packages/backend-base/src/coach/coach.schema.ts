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
    // NEW — long-form prose (desktop). Optional so pre-prose reports validate.
    overview: t.Optional(t.Array(t.String())),
    strengthsProse: t.Optional(t.Array(FeedbackPointSchema)),
    improvementsProse: t.Optional(t.Array(FeedbackPointSchema)),
    recommendationsProse: t.Optional(t.Array(FeedbackPointSchema)),
  }),
  // Ordered PDF-parity sections rendered after Recommendations. Optional so
  // reports generated before this feature still validate.
  sections: t.Optional(t.Array(SectionSchema)),
  docUrl: t.String(),
  pdfUrl: t.String(),
});
