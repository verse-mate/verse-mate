import type { db as Database } from "database";

import { reportToRow } from "./coach-store.transform";
import type {
  CoachMonthlyNarrative,
  CoachReport,
  LeaderMonthlySummary,
} from "./coach.service";
import { CLUSTERS, DIMENSIONS, statusForScore } from "./rubric";

export const FIXTURE_ADMIN = "fixture-admin@example.org";

export const FIXTURE_LEADERS = [
  {
    slug: "fixture-avery-lane",
    email: "avery.lane@example.org",
    name: "Avery Lane",
    group: "Tuesday Dawn Group, Cedar Hollow Fellowship",
    coachName: "Morgan Reed",
  },
  {
    slug: "fixture-jordan-pike",
    email: "jordan.pike@example.org",
    name: "Jordan Pike",
    group: "Thursday Evening Group, Riverbend Chapel",
    coachName: "Morgan Reed",
  },
] as const;

export const FIXTURE_MONTH = "2033-03";

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function fixtureReport(
  id: string,
  date: string,
  score: number,
  over: Partial<CoachReport> = {},
): CoachReport {
  const status = statusForScore(score);
  const pct = Math.round(score);
  return {
    id,
    date,
    dateLabel: dateLabel(date),
    session: `Philippians, Lesson ${date.slice(-2)}`,
    topic: "Philippians 2",
    duration: "1h 05m",
    attendees: 12,
    newcomers: 1,
    score,
    base: score - 1,
    newcomerBonus: 1,
    sizeBonus: 0,
    status: status.label,
    statusEmoji: status.emoji,
    clusters: CLUSTERS.map((c) => ({
      name: c.name,
      weight: c.weight,
      scorePct: pct,
      contribution: Math.round(c.weight * pct) / 100,
    })),
    dimensions: DIMENSIONS.map((d) => ({
      n: d.n,
      name: d.name,
      score: 4,
      note: "The group stayed in the passage.",
    })),
    bigIdeas: ["Humility looks like service", "Joy does not wait on comfort"],
    feedback: {
      headline: "A steady session that kept the group in the text",
      strengths: ['"What did Paul ask of them here?" opened the discussion'],
      improvements: ["Leave more silence after a hard question"],
      recommendations: ["Invite one newcomer to read next week"],
    },
    sections: [
      {
        title: "Key Moments",
        moments: [
          { timestamp: "00:12:40", detail: "A member shared a costly story" },
        ],
      },
    ],
    pdfUrl: "https://example.org/reports/fixture.pdf",
    docUrl: "",
    ...over,
  };
}

export const FIXTURE_REPORTS: Array<{
  coachId: string;
  report: CoachReport;
  legacyIds: string[];
}> = [
  {
    coachId: FIXTURE_LEADERS[0].slug,
    report: fixtureReport("fixture-avery-2033-02-22", "2033-02-22", 66.4),
    legacyIds: [],
  },
  {
    coachId: FIXTURE_LEADERS[0].slug,
    report: fixtureReport("fixture-avery-2033-03-08", "2033-03-08", 74.2),
    legacyIds: ["avery-lane-2033-03-08-tuesday-dawn-group"],
  },
  {
    coachId: FIXTURE_LEADERS[0].slug,
    report: fixtureReport("fixture-avery-2033-03-15", "2033-03-15", 81.0),
    legacyIds: [],
  },
  {
    coachId: FIXTURE_LEADERS[1].slug,
    report: fixtureReport("fixture-jordan-2033-03-10", "2033-03-10", 58.7),
    legacyIds: [],
  },
];

export const FIXTURE_NARRATIVE: CoachMonthlyNarrative = {
  executiveSummary: ["Two leaders met four times across the month."],
  trends: ["Discussion time grew in every group."],
};

export function fixtureLeaderSummary(): LeaderMonthlySummary {
  const leader = FIXTURE_LEADERS[0];
  const reports = FIXTURE_REPORTS.filter(
    (r) => r.coachId === leader.slug && r.report.date.startsWith(FIXTURE_MONTH),
  ).map((r) => r.report);
  const row = (r: CoachReport) => ({
    date: r.date,
    session: r.session,
    bm: 80,
    tc: 76,
    ep: 70,
    br: 74,
    composite: r.score,
    status: r.status,
  });
  return {
    month: FIXTURE_MONTH,
    monthLabel: "March 2033",
    priorMonthLabel: "February 2033",
    leaderId: leader.slug,
    leaderName: leader.name,
    group: leader.group,
    sessionsCount: reports.length,
    composite: 77.6,
    status: { label: "Strong", emoji: statusForScore(77.6).emoji },
    priorComposite: 66.4,
    delta: 11.2,
    clusterAvg: { tc: 76, bm: 80, ep: 70, br: 74 },
    glance: {
      rows: reports.map(row),
      avg: {
        bm: 80,
        tc: 76,
        ep: 70,
        br: 74,
        composite: 77.6,
        status: "Strong",
      },
    },
    trajectory: reports.map((r) => ({
      date: r.date,
      session: r.session,
      composite: r.score,
      status: r.status,
      delta: null,
    })),
    clusters: CLUSTERS.map((c) => ({
      key: c.name,
      name: c.name,
      weight: c.weight,
      avgPct: 75,
      statusLabel: "Strong",
      strongestDim: { name: DIMENSIONS[0].name, val: 4 },
      weakestDim: { name: DIMENSIONS[1].name, val: 3 },
      insight: "Held steady across the month.",
    })),
    strengths: [
      { text: "Questions before answers", session: reports[0].session },
    ],
    growth: [{ text: "Longer wait time", session: reports[0].session }],
    trends: ["Scores rose each week."],
    conversationGuide: [{ label: "Open", q: "What changed this month?" }],
    focus: { clusterName: "Engaging People", clusterPct: 70, goals: ["Wait"] },
    sessions: reports.map((r) => ({
      date: r.date,
      session: r.session,
      composite: r.score,
      status: r.status,
      dimensions: DIMENSIONS.map((d) => ({
        n: d.n,
        name: d.name,
        cluster: d.cluster,
        score: 4,
        note: "",
      })),
    })),
  };
}

const SLUGS = FIXTURE_LEADERS.map((l) => l.slug);

export async function clearCoachFixture(
  database: typeof Database,
): Promise<void> {
  const conn = database.getOrCreateConnection();
  for (const table of [
    "coach_reports",
    "coach_notes",
    "coach_recording_links",
    "coach_monthly_leader_summaries",
  ] as const)
    await conn.deleteFrom(table).where("coach_id", "in", SLUGS).execute();
  await conn
    .deleteFrom("coach_monthly_narratives")
    .where("month", "=", FIXTURE_MONTH)
    .execute();
  await conn
    .deleteFrom("coach_admins")
    .where("email", "=", FIXTURE_ADMIN)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", SLUGS).execute();
}

export async function seedCoachFixture(
  database: typeof Database,
): Promise<void> {
  await clearCoachFixture(database);
  const conn = database.getOrCreateConnection();
  await conn
    .insertInto("coach_leaders")
    .values(
      FIXTURE_LEADERS.map((l) => ({
        slug: l.slug,
        email: l.email,
        name: l.name,
        group_name: l.group,
        coach_name: l.coachName,
      })),
    )
    .execute();
  await conn
    .insertInto("coach_admins")
    .values({ email: FIXTURE_ADMIN })
    .execute();
  const ordinals = new Map<string, number>();
  for (const { coachId, report, legacyIds } of FIXTURE_REPORTS) {
    const key = `${coachId}:${report.date}`;
    const ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    await conn
      .insertInto("coach_reports")
      .values({
        ...reportToRow(coachId, report as never, ordinal),
        legacy_ids: legacyIds,
      } as never)
      .execute();
  }
  await conn
    .insertInto("coach_monthly_narratives")
    .values({
      month: FIXTURE_MONTH,
      executive_summary: JSON.stringify(FIXTURE_NARRATIVE.executiveSummary),
      trends: JSON.stringify(FIXTURE_NARRATIVE.trends),
    } as never)
    .execute();
  await conn
    .insertInto("coach_monthly_leader_summaries")
    .values({
      coach_id: FIXTURE_LEADERS[0].slug,
      month: FIXTURE_MONTH,
      summary: JSON.stringify(fixtureLeaderSummary()),
    })
    .execute();
}
