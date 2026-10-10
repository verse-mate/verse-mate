import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { CoachMonthlyService } from "./coach-monthly.service";
import { isolateTable } from "./coach-test-tables";
import { CoachService } from "./coach.service";
import {
  DIMENSIONS,
  composeBaseScore,
  composeComposite,
  statusForScore,
} from "./rubric";

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");
isolateTable("coach_monthly_reports");

const ANA = "mon-ana";
const BEN = "mon-ben";
const BENCH = "mon-bench";
const ADMIN = "mon-admin@example.test";
const LEADERS = [ANA, BEN, BENCH];
const EMAIL = (slug: string) => `${slug}@example.test`;

class Mailer {
  sent: Array<{ to: string; subject: string; html: string; text: string }> = [];
  constructor(private readonly reject: (to: string) => boolean = () => false) {}
  async sendEmail(data: {
    to: { email: string };
    subject: string;
    html?: string;
    text?: string;
  }) {
    this.sent.push({
      to: data.to.email,
      subject: data.subject,
      html: data.html ?? "",
      text: data.text ?? "",
    });
    return this.reject(data.to.email)
      ? { delivered: false, error: "rejected" }
      : { delivered: true };
  }
  to(email: string) {
    return this.sent.filter((s) => s.to === email);
  }
}

function leaderProse(over: Record<string, unknown> = {}) {
  return {
    profile: { study: "Jonah", format: "Zoom", groupSize: null },
    clusterInsights: {
      "Building Ministry": "Homework came up every week.",
      "Teaching Craft": "Scripture led every discussion.",
      "Engaging People": "Quiet members were called on by name.",
      "Being Real": "The leader shared a hard week honestly.",
    },
    strengths: [
      {
        text: "Scripture first",
        quote: "let's read it before we talk",
        session: "2031-09-03",
      },
      {
        text: "Warm welcome",
        quote: "welcome back, everyone",
        session: "2031-09-10",
      },
      {
        text: "Honest sharing",
        quote: "I struggled with this one too",
        session: "2031-09-17",
      },
    ],
    growth: [
      {
        text: "Talk ratio",
        tip: "Ask a question and count to seven",
        session: "2031-09-03",
      },
      {
        text: "Big ideas",
        tip: "Close with one sentence the group repeats",
        session: "2031-09-10",
      },
      {
        text: "Prayer",
        tip: "Hand the closing prayer to a member",
        session: "2031-09-17",
      },
    ],
    trends: [
      "Participation rose from the first session to the third (2031-09-03, 2031-09-17).",
    ],
    conversationGuide: [
      { label: "Strongest area", q: "What made scripture land this month?" },
      { label: "Growth area", q: "What would help you speak less?" },
      {
        label: "Trajectory",
        q: "What changed between the first and the last session?",
      },
      { label: "Group dynamics", q: "Who has not spoken yet?" },
    ],
    focusGoals: [
      "Leader talk under 50% in two sessions",
      "One delegated prayer each week",
    ],
    ...over,
  };
}

function programProse(
  leaders: string[],
  over: Record<string, unknown> = {},
  figures: string[] = ["lowest-dimension", "declining"],
) {
  return {
    executiveSummary: ["The program held steady this month."],
    trends: ["Participation rose across the program."],
    snapshots: Object.fromEntries(
      leaders.map((id) => [id, "Strong on scripture, growing in delegation."]),
    ),
    initiatives: [
      { text: "Focus the coaching on this", figure: figures[0] },
      { text: "Follow it up next month", figure: figures[1] ?? figures[0] },
    ],
    ...over,
  };
}

class MonthlyAi implements AiProvider {
  readonly name = "fake";
  calls = 0;
  constructor(
    private readonly leader: (prompt: string) => unknown = () => leaderProse(),
    private readonly program: (
      leaders: string[],
      figures: string[],
    ) => unknown = (l, f) => programProse(l, {}, f),
  ) {}
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    this.calls += 1;
    const system = opts.messages[0]?.content;
    const said = opts.messages.map((m) => m.content).join("\n");
    if (system === CoachMonthlyService.leaderInstructions())
      return { content: JSON.stringify(this.leader(said)), model: "fake" };
    if (system === CoachMonthlyService.programInstructions()) {
      const ids = [...said.matchAll(/leader id: ([a-z-]+)/g)].map((m) => m[1]);
      const figures = [...said.matchAll(/"id":"([a-z0-9-]+)","text"/g)].map(
        (m) => m[1],
      );
      return {
        content: JSON.stringify(this.program(ids, figures)),
        model: "fake",
      };
    }
    throw new Error("unexpected call");
  }
  private no(): never {
    throw new Error("not part of the monthly job");
  }
  responsesCreate = () => this.no();
  filesCreate = () => this.no();
  filesRetrieve = () => this.no();
  filesContent = () => this.no();
  batchesCreate = () => this.no();
  batchesRetrieve = () => this.no();
  batchesCancel = () => this.no();
}

async function report(
  coachId: string,
  date: string,
  scores: (n: number) => number | null = () => 4,
  held = false,
) {
  const dims = new Map(DIMENSIONS.map((d) => [d.n, scores(d.n)]));
  const { base, clusters } = composeBaseScore(dims);
  const score = composeComposite(base, { newcomerBonus: 0, sizeBonus: 0 });
  await conn
    .insertInto("coach_reports")
    .values({
      id: `${coachId}-${date}`,
      coach_id: coachId,
      session_date: date,
      source_session_id: `legacy:${coachId}:${date}`,
      legacy_ids: [],
      held,
      summary: JSON.stringify({
        session: `Jonah study ${date}`,
        score,
        status: statusForScore(score).label,
      }),
      metrics: JSON.stringify({
        base,
        clusters,
        dimensions: DIMENSIONS.map((d) => ({
          n: d.n,
          name: d.name,
          score: dims.get(d.n),
          note: `note ${d.n}`,
        })),
      }),
      body: JSON.stringify({
        bigIdeas: [],
        feedback: {
          headline: "h",
          strengths: ["Scripture first"],
          improvements: ["Talk ratio"],
          strengthsProse: [
            {
              title: "Scripture first",
              paragraphs: [
                "He said “let's read it before we talk”, then “welcome back, everyone” and “I struggled with this one too”.",
              ],
            },
          ],
        },
      }),
    })
    .execute();
}

async function clear() {
  await conn.deleteFrom("coach_monthly_reports").execute();
  await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", LEADERS)
    .execute();
  await conn
    .deleteFrom("coach_monthly_leader_summaries")
    .where("coach_id", "in", LEADERS)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", LEADERS).execute();
}

async function rows(month = "2031-09") {
  return conn
    .selectFrom("coach_monthly_reports")
    .selectAll()
    .where("month", "=", month)
    .orderBy("kind")
    .orderBy("coach_id")
    .execute();
}

function service(mailer: Mailer | null = new Mailer(), ai = new MonthlyAi()) {
  return new CoachMonthlyService(Database, ai, mailer as never);
}

async function sentBefore(month = "2031-07") {
  await conn
    .insertInto("coach_monthly_reports")
    .values({
      kind: "program",
      month,
      summary: JSON.stringify({}),
      state: "sent",
      sent_at: new Date().toISOString(),
    })
    .execute();
}

beforeEach(async () => {
  process.env[COACH_PIPELINE_LIVE] = "true";
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: ANA, email: EMAIL(ANA), name: "Ana Pell", group_name: "Harbor" },
      { slug: BEN, email: EMAIL(BEN), name: "Ben Ostrow" },
      {
        slug: BENCH,
        email: EMAIL(BENCH),
        name: "Avery Hollis",
        is_benchmark: true,
      },
    ])
    .execute();
  await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
});
afterEach(async () => {
  delete process.env[COACH_PIPELINE_LIVE];
  await clear();
});

describe("Each Leader Gets A Monthly Summary (task 6.16)", () => {
  it("A leader taught three sessions in a month: every section, numbers from the reports, emailed to the leader alone as a portal link", async () => {
    await sentBefore();
    for (const date of ["2031-09-03", "2031-09-10", "2031-09-17"])
      await report(ANA, date);
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    const [summary] = (await rows()).filter((r) => r.kind === "leader");
    expect(summary).toMatchObject({ coach_id: ANA, state: "sent" });
    const s = summary.summary as Record<string, any>;
    expect(s.glance.rows).toHaveLength(3);
    expect(s.glance.avg.composite).toBeCloseTo(s.composite, 6);
    expect(s.profile).toEqual({ study: "Jonah", format: "Zoom" });
    expect(
      s.clusters.map((c: { insight: string }) => c.insight).every(Boolean),
    ).toBe(true);
    expect(s.strengths).toHaveLength(3);
    expect(s.growth[0].text).toContain("count to seven");
    expect(s.trends).toHaveLength(1);
    expect(s.conversationGuide).toHaveLength(4);
    expect(s.focus.goals).toHaveLength(2);
    expect(s.sessions).toHaveLength(3);
    expect(mailer.to(EMAIL(ANA))).toHaveLength(1);
    expect(mailer.to(EMAIL(ANA))[0].html).toContain(
      "/coach/monthly-summary?month=2031-09",
    );
    expect(mailer.to(EMAIL(BENCH)).map((m) => m.subject)).not.toContain(
      mailer.to(EMAIL(ANA))[0].subject,
    );
  });

  it("A leader with no session in the month gets no summary and nothing is sent", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    expect((await rows()).some((r) => r.coach_id === BEN)).toBe(false);
    expect(mailer.to(EMAIL(BEN))).toEqual([]);
  });

  it("a held report the leader cannot see is not part of their month", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    await report(ANA, "2031-09-10", () => 2, true);
    await service().produce("2031-09");
    const [summary] = (await rows()).filter((r) => r.kind === "leader");
    expect((summary.summary as { sessionsCount: number }).sessionsCount).toBe(
      1,
    );
  });

  it("A month the host already summarised keeps the host's summary, and the pipeline sends none", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    await conn
      .insertInto("coach_monthly_leader_summaries")
      .values({
        coach_id: ANA,
        month: "2031-09",
        summary: JSON.stringify({ month: "2031-09" }),
      })
      .execute();
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    expect((await rows()).some((r) => r.coach_id === ANA)).toBe(false);
    expect(mailer.to(EMAIL(ANA))).toEqual([]);
  });

  it("A report changes after its month was summarised: the sent summary is unchanged and not re-sent, and the portal's view shows the new score", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    const before = (await rows()).find((r) => r.kind === "leader")?.summary as {
      composite: number;
    };
    await conn
      .updateTable("coach_reports")
      .set({
        summary: JSON.stringify({
          session: "Jonah",
          score: 41.5,
          status: "Developing",
        }),
      })
      .where("id", "=", `${ANA}-2031-09-03`)
      .execute();
    await service(mailer).produce("2031-09");
    await service(mailer).sendDue();
    const after = (await rows()).find((r) => r.kind === "leader")?.summary as {
      composite: number;
    };
    expect(after.composite).toBe(before.composite);
    expect(mailer.to(EMAIL(ANA))).toHaveLength(1);
    const view = await new CoachService(Database).getMonthlySummaryById(
      ANA,
      "2031-09",
    );
    expect(view?.summary?.composite).toBe(41.5);
    expect(view?.summary?.trends).toEqual(
      (after as unknown as { trends: string[] }).trends,
    );
  });

  it("A month the host did not summarise before cutover: the pipeline's first months are held until an admin releases each", async () => {
    await report(ANA, "2031-09-03");
    await report(BEN, "2031-09-04");
    const mailer = new Mailer();
    const monthly = service(mailer);
    await monthly.produce("2031-09");
    const produced = await rows();
    expect(produced.map((r) => [r.kind, r.state])).toEqual([
      ["leader", "held"],
      ["leader", "held"],
      ["program", "held"],
    ]);
    expect(produced[0].hold_reason).toContain("first month after cutover");
    expect(mailer.sent).toEqual([]);
    for (const row of produced)
      expect(await monthly.release(row.id)).toMatchObject({ released: true });
    expect(mailer.to(EMAIL(ANA))).toHaveLength(1);
    expect(mailer.to(ADMIN)).toHaveLength(1);
  });

  it("The first month after cutover is held, and later months are sent without a hold unless a check fails", async () => {
    await report(ANA, "2031-08-03");
    await report(ANA, "2031-09-03");
    const mailer = new Mailer();
    const monthly = service(mailer);
    await monthly.produce("2031-08");
    for (const row of await rows("2031-08")) await monthly.release(row.id);
    await monthly.produce("2031-09");
    expect((await rows()).map((r) => r.state)).toEqual(["sent", "sent"]);
  });

  it("A monthly summary names the benchmark leader: held for review, then corrected and released by an admin", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    const mailer = new Mailer();
    const monthly = service(
      mailer,
      new MonthlyAi(() =>
        leaderProse({ trends: ["Closer to Avery Hollis than last month."] }),
      ),
    );
    await monthly.produce("2031-09");
    const held = (await rows()).find((r) => r.kind === "leader");
    expect(held).toMatchObject({ state: "held" });
    expect(held?.hold_reason).toContain("benchmark leader");
    expect(mailer.to(EMAIL(ANA))).toEqual([]);
    expect(
      await monthly.edit(held?.id as number, {
        trends: ["Steadier than last month."],
      }),
    ).toEqual({ ok: true });
    expect(await monthly.release(held?.id as number)).toMatchObject({
      released: true,
    });
    expect(mailer.to(EMAIL(ANA))).toHaveLength(1);
  });

  it("a release that still names the benchmark leader is refused", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    const monthly = service(
      new Mailer(),
      new MonthlyAi(() => leaderProse({ trends: ["Like Avery Hollis."] })),
    );
    await monthly.produce("2031-09");
    const held = (await rows()).find((r) => r.kind === "leader");
    expect(await monthly.release(held?.id as number)).toEqual({
      released: false,
      refusal: "benchmark-name",
    });
  });

  it("a summary missing a section, or quoting words the month's sessions never had, is held naming it", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    await report(BEN, "2031-09-03");
    await service(
      new Mailer(),
      new MonthlyAi((prompt) =>
        prompt.includes("Ana Pell")
          ? leaderProse({ conversationGuide: [] })
          : leaderProse({
              strengths: leaderProse().strengths.map((s, i) =>
                i === 0 ? { ...s, quote: "words nobody said" } : s,
              ),
            }),
      ),
    ).produce("2031-09");
    const [ana, ben] = (await rows()).filter((r) => r.kind === "leader");
    expect(ana.hold_reason).toContain("conversation guide");
    expect(ben.hold_reason).toContain("not found in the month's sessions");
  });

  it("The monthly summary goes to the leader alone, and a leader with no address of their own is skipped and reported", async () => {
    await sentBefore();
    await conn
      .updateTable("coach_leaders")
      .set({ email: "mon-ben@needs-real-email.invalid" })
      .where("slug", "=", BEN)
      .execute();
    await report(BEN, "2031-09-03");
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    const ben = (await rows()).find((r) => r.coach_id === BEN);
    expect(ben).toMatchObject({
      state: "sent",
      skipped: ["mon-ben@needs-real-email.invalid"],
    });
    expect(mailer.to("mon-ben@needs-real-email.invalid")).toEqual([]);
    expect(mailer.to(EMAIL(BEN))).toEqual([]);
  });

  it("A month ends during the parallel run: everything is produced for admins only, and nothing is sent, then or later", async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    await report(ANA, "2031-09-03");
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    expect((await rows()).map((r) => r.state)).toEqual([
      "parallel-run",
      "parallel-run",
    ]);
    process.env[COACH_PIPELINE_LIVE] = "true";
    await service(mailer).sendDue();
    expect(mailer.sent).toEqual([]);
    const view = await new CoachService(Database).getMonthlySummaryById(
      ANA,
      "2031-09",
    );
    expect(view?.summary?.trends).toEqual(leaderProse().trends);
  });

  it("the leader's own view shows no prose the leader was not sent", async () => {
    await report(ANA, "2031-09-03");
    await service().produce("2031-09");
    const leaderUser = await conn
      .insertInto("user")
      .values({
        email: EMAIL(ANA),
        firstName: "Ana",
        lastName: "Pell",
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    try {
      const mine = await new CoachService(Database).getMyMonthlySummary(
        leaderUser.id,
        "2031-09",
      );
      expect(mine?.summary).toBeTruthy();
      expect(mine?.summary?.trends).toEqual([]);
    } finally {
      await conn.deleteFrom("user").where("id", "=", leaderUser.id).execute();
    }
  });
});

describe("The Program Owners Get A Monthly Program Report (task 6.16)", () => {
  it("The owners receive the month: one email each with the leaderboard and links, and no leader receives it", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03", () => 5);
    await report(BEN, "2031-09-04", () => 3);
    await report(BENCH, "2031-09-05", () => 4);
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    const program = (await rows()).find((r) => r.kind === "program");
    expect(program?.hold_reason ?? null).toBeNull();
    expect(program?.state).toBe("sent");
    for (const owner of [ADMIN, EMAIL(BENCH)]) {
      const mail = mailer.sent.filter(
        (m) => m.to === owner && m.subject.includes("program"),
      );
      expect(mail).toHaveLength(1);
      expect(mail[0].html).toContain("Ana Pell");
      expect(mail[0].html).toContain("Ben Ostrow");
      expect(mail[0].html).toContain("/coach/monthly?month=2031-09");
      expect(mail[0].html).toContain(
        `/coach/leader/${BEN}/monthly?month=2031-09`,
      );
    }
    for (const leader of [ANA, BEN])
      expect(
        mailer.to(EMAIL(leader)).filter((m) => m.subject.includes("program")),
      ).toEqual([]);
    const p = program?.summary as Record<string, any>;
    expect(p.leaderboard.map((l: { id: string }) => l.id)).toEqual([
      ANA,
      BENCH,
      BEN,
    ]);
    expect(p.overview).toMatchObject({
      sessions: 3,
      leaders: 3,
      from: "2031-09-03",
      to: "2031-09-05",
    });
    expect(
      p.bands.reduce((n: number, b: { count: number }) => n + b.count, 0),
    ).toBe(3);
  });

  it("A leader's scores are declining: two months of falling composites put them under declining trajectory", async () => {
    await sentBefore("2031-06");
    await report(BEN, "2031-07-03", () => 5);
    await report(BEN, "2031-08-03", () => 4);
    await report(BEN, "2031-09-03", () => 3);
    await report(ANA, "2031-09-03", () => 4);
    await service().produce("2031-09");
    const p = (await rows()).find((r) => r.kind === "program")
      ?.summary as Record<string, any>;
    expect(p.priorityMatrix.declining).toEqual([BEN]);
  });

  it("A dimension is weak across the program: the heat map marks it weak and an initiative names it with the number of leaders", async () => {
    await sentBefore();
    for (const [leader, day] of [
      [ANA, "03"],
      [BEN, "04"],
      [BENCH, "05"],
    ] as const)
      await report(leader, `2031-09-${day}`, (n) =>
        n === 11 ? 2 : leader === BENCH ? 4 : n === 11 ? 2 : 4,
      );
    await service().produce("2031-09");
    const p = (await rows()).find((r) => r.kind === "program")
      ?.summary as Record<string, any>;
    const prayer = p.heatMap.rows.map(
      (r: { cells: Array<{ n: number; mark: string }> }) =>
        r.cells.find((c) => c.n === 11)?.mark,
    );
    expect(prayer).toEqual(["weak", "weak", "weak"]);
    expect(
      p.initiatives.some(
        (i: string) => i.includes("Prayer") && i.includes("3 of 3 leaders"),
      ),
    ).toBe(true);
  });

  it("a program report missing a section is held naming it", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    await service(
      new Mailer(),
      new MonthlyAi(undefined, (ids, f) =>
        programProse(ids, { executiveSummary: [] }, f),
      ),
    ).produce("2031-09");
    const program = (await rows()).find((r) => r.kind === "program");
    expect(program).toMatchObject({ state: "held" });
    expect(program?.hold_reason).toContain("executive summary");
  });

  it("the admin's cross-leader monthly view shows the program report as the month's narrative", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    await service().produce("2031-09");
    const monthly = await new CoachService(Database).getMonthly("2031-09");
    expect(monthly.narrative?.executiveSummary).toEqual([
      "The program held steady this month.",
    ]);
    expect(monthly.programReport?.leaderboard[0].id).toBe(ANA);
  });

  it("producing a month twice changes nothing already produced", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    const ai = new MonthlyAi();
    const mailer = new Mailer();
    await service(mailer, ai).produce("2031-09");
    const calls = ai.calls;
    await service(mailer, ai).produce("2031-09");
    expect(ai.calls).toBe(calls);
    expect(mailer.to(EMAIL(ANA))).toHaveLength(1);
  });
});

describe("the monthly job", () => {
  it("runs on the first of the month, Chicago time, for the month just ended", async () => {
    const { monthJustEnded, coachMonthlyRepeat } = await import(
      "./coach-monthly.worker"
    );
    expect(monthJustEnded(new Date("2031-10-01T14:00:00Z"))).toBe("2031-09");
    expect(monthJustEnded(new Date("2031-10-01T04:00:00Z"))).toBe("2031-08");
    expect(monthJustEnded(new Date("2032-01-01T15:00:00Z"))).toBe("2031-12");
    expect(coachMonthlyRepeat()).toEqual({
      pattern: "0 9 1 * *",
      tz: "America/Chicago",
    });
  });
});

describe("review fixes: the monthly job survives failures and never sends twice", () => {
  it("A month the host did not summarise before cutover: produced again after cutover and held for release, the parallel-run copies never sent", async () => {
    await sentBefore();
    delete process.env[COACH_PIPELINE_LIVE];
    await report(ANA, "2031-09-03");
    const mailer = new Mailer();
    await service(mailer).produce("2031-09");
    process.env[COACH_PIPELINE_LIVE] = "true";
    await service(mailer).produce("2031-09");
    const after = await rows();
    expect(after.map((r) => r.state)).toEqual(["held", "held"]);
    expect(after[0].hold_reason).toContain("ended before cutover");
    expect(mailer.sent).toEqual([]);
    const leaderRow = after.find((r) => r.kind === "leader");
    await service(mailer).release(leaderRow?.id as number);
    expect(mailer.to(EMAIL(ANA))).toHaveLength(1);
  });

  it("one summary the model fails to write is held saying so, and the rest of the month is still produced and sent", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    await report(BEN, "2031-09-04");
    const ai = new MonthlyAi((prompt) => {
      if (prompt.includes("Ben Ostrow")) throw new Error("model timed out");
      return leaderProse();
    });
    const mailer = new Mailer();
    await service(mailer, ai).produce("2031-09");
    const byCoach = Object.fromEntries(
      (await rows()).map((r) => [r.coach_id ?? "program", r]),
    );
    expect(byCoach[BEN]).toMatchObject({ state: "held" });
    expect(byCoach[BEN].hold_reason).toContain("could not be written");
    expect(byCoach[ANA].state).toBe("sent");
    expect(byCoach.program.state).toBe("sent");
  });

  it("producing the same month twice at once stores each summary once and does not fail", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    await Promise.all([
      service(new Mailer()).produce("2031-09"),
      service(new Mailer()).produce("2031-09"),
    ]);
    expect((await rows()).map((r) => r.kind)).toEqual(["leader", "program"]);
  });

  it("releasing after a partly failed send reaches only the recipients who did not get it", async () => {
    await sentBefore();
    await report(ANA, "2031-09-03");
    const rejectOnce = new Set([ADMIN]);
    const flaky = new Mailer((to) => rejectOnce.delete(to));
    await service(flaky).produce("2031-09");
    const program = (await rows()).find((r) => r.kind === "program");
    expect(program?.state).toBe("held");
    const before = flaky.sent.length;
    await service(flaky).release(program?.id as number);
    const resent = flaky.sent.slice(before).map((s) => s.to);
    expect(resent).toEqual([ADMIN]);
    expect(
      (await rows()).find((r) => r.kind === "program")?.sent_to.sort(),
    ).toEqual([ADMIN, EMAIL(BENCH)].sort());
  });

  it("a summary left sending by a crash is held for an admin to check, not stuck", async () => {
    await sentBefore();
    await conn
      .insertInto("coach_monthly_reports")
      .values({
        kind: "leader",
        coach_id: ANA,
        month: "2031-09",
        summary: JSON.stringify({}),
        state: "sending",
        sending_at: sql`now() - interval '2 hours'`,
      })
      .execute();
    await service(new Mailer()).sendDue();
    const row = (await rows()).find((r) => r.coach_id === ANA);
    expect(row?.state).toBe("held");
    expect(row?.hold_reason).toContain("send unconfirmed");
  });
});
