import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import { applyFirstLessonDetection, classDay } from "./coach-first-lesson";
import { parallelRunComparison } from "./coach-parallel-run";
import { CoachPipelineService } from "./coach-pipeline.service";
import {
  bodyAnswer,
  bodySentences,
  isBodyCall,
} from "./coach-report-body.fixture";
import { CoachReviewService } from "./coach-review.service";
import { BIG_IDEAS_REVIEW_LABEL } from "./coach-scorecard";
import { CoachScoringService } from "./coach-scoring.service";
import type { TimedLine } from "./coach-transcript";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import {
  DIMENSIONS,
  FIRST_LESSON_RATIONALE,
  composeBaseScore,
  composeComposite,
} from "./rubric";

const conn = Database.getOrCreateConnection();
const COACH = "first-lesson-coach";

const SCORECARD = [
  {
    title: "Scorecard — Table 3",
    bullets: [
      "Overall Class Time: 1h 30m  (Target: 1.5-2h)  → ON TARGET",
      "Big Ideas review at open: 6 min (7%)  (Target: 5-10 min)  → ON TARGET",
      "Lesson / Teaching: 50 min (55%)  (Target: 50-60%)  → ON TARGET",
    ],
  },
];

interface SeededReport {
  id: string;
  date: string;
  session: string;
  legacy?: boolean;
}

const EARLIER: SeededReport = {
  id: "fl-2026-09-24",
  date: "2026-09-24",
  session: "Lakeside Midweek Group — Jonah, Lesson 2 of 2",
  legacy: true,
};
const NEXT: SeededReport = {
  id: "fl-2026-10-01",
  date: "2026-10-01",
  session: "Thursday 7pm",
};

async function seed(report: SeededReport, score = 4) {
  await conn
    .insertInto("coach_reports")
    .values({
      id: report.id,
      coach_id: COACH,
      session_date: report.date,
      source_session_id: report.legacy
        ? `legacy:${COACH}:${report.date}`
        : `ff-${report.id}`,
      legacy_ids: [],
      summary: { session: report.session, topic: report.session },
      metrics: JSON.stringify({
        newcomerBonus: 0,
        sizeBonus: 0,
        dimensions: DIMENSIONS.map((d) => ({
          n: d.n,
          name: d.name,
          score,
          note: `machine ${d.n}`,
        })),
      }),
      body: JSON.stringify({ bigIdeas: [], feedback: {}, sections: SCORECARD }),
    })
    .execute();
  if (report.legacy) return;
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: `ff-${report.id}`,
      coach_id: COACH,
      title: report.session,
      session_date: report.date,
      state: "scored",
      report_id: report.id,
    })
    .execute();
  await conn
    .insertInto("coach_report_dimension_scores")
    .values(
      DIMENSIONS.map((d) => ({
        report_id: report.id,
        dimension_n: d.n,
        score,
        rationale: `machine ${d.n}`,
        provenance: "machine",
        model_version: "v3-weighted-100",
      })),
    )
    .execute();
}

async function detect(id: string, line: string | null) {
  return conn
    .transaction()
    .execute((trx) =>
      applyFirstLessonDetection(trx as CoachReportsWriter, id, line),
    );
}

async function state(id: string) {
  const report = await conn
    .selectFrom("coach_reports")
    .select([
      "first_lesson",
      "first_lesson_source",
      "first_lesson_line",
      "summary",
      "metrics",
      "body",
    ])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  const dim9 = await conn
    .selectFrom("coach_report_dimension_scores")
    .select(["score", "rationale", "provenance", "corrected_by"])
    .where("report_id", "=", id)
    .where("dimension_n", "=", 9)
    .executeTakeFirst();
  const sections = ((report.body as { sections?: typeof SCORECARD }).sections ??
    []) as typeof SCORECARD;
  return {
    ...report,
    score: (report.summary as { score?: number }).score,
    rows: sections.flatMap((s) => s.bullets),
    dim9,
  };
}

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "=", COACH)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "=", COACH)
    .execute();
}

function allFoursWithoutNine(): number {
  const scores = new Map(
    DIMENSIONS.map((d) => [d.n, d.n === 9 ? null : 4] as const),
  );
  return composeComposite(composeBaseScore(scores).base, {
    newcomerBonus: 0,
    sizeBonus: 0,
  });
}

class AnsweringAi implements AiProvider {
  readonly name = "fake";
  sent: AiChatOptions[] = [];
  constructor(
    private readonly firstLesson: unknown = { answer: false, line: "" },
    private readonly body: Record<string, unknown> = {},
  ) {}
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    this.sent.push(opts);
    if (isBodyCall(opts))
      return { content: bodyAnswer(this.body), model: "fake" };
    if (opts.messages.some((m) => m.images?.length))
      return {
        content: JSON.stringify({ score: 4, rationale: "a chart on screen" }),
        model: "fake",
      };
    return {
      content: JSON.stringify({
        newcomers: 0,
        firstLesson: this.firstLesson,
        dimensions: DIMENSIONS.map((d) => ({
          n: d.n,
          score: 4,
          rationale: `a genuine reason for dimension ${d.n}`,
        })),
      }),
      model: "fake",
    };
  }
  private unused(name: string): never {
    throw new Error(`AnsweringAi.${name} is not part of scoring`);
  }
  responsesCreate = () => this.unused("responsesCreate");
  filesCreate = () => this.unused("filesCreate");
  filesRetrieve = () => this.unused("filesRetrieve");
  filesContent = () => this.unused("filesContent");
  batchesCreate = () => this.unused("batchesCreate");
  batchesRetrieve = () => this.unused("batchesRetrieve");
  batchesCancel = () => this.unused("batchesCancel");
}

const OPENING: TimedLine[] = [
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Good morning. We're starting Amos this week, so grab your workbooks.",
    startTime: 5,
  },
  {
    speakerId: "speaker-2",
    isLeader: false,
    text: "Is this the shepherd from Tekoa?",
    startTime: 12,
  },
];

const IN_PASSING: TimedLine[] = [
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Let's open in prayer.",
    startTime: 2,
  },
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "So this week we started looking at Amos, and the first thing is the lions.",
    startTime: 1840,
  },
];

const CONTINUING: TimedLine[] = [
  {
    speakerId: "speaker-1",
    isLeader: true,
    text: "Last week we left Jonah in the belly of the fish.",
    startTime: 4,
  },
];

async function score(
  title: string,
  transcript: TimedLine[],
  firstLesson: unknown,
) {
  const ai = new AnsweringAi(firstLesson);
  const result = await new CoachScoringService(Database, ai).scoreSession({
    sessionTitle: title,
    transcript,
  });
  return { result, ai };
}

describe("Memory Reinforcement is not applicable on a study's first lesson (task 5.17)", () => {
  it("the text scoring call is given the recorded title and asked the first-lesson question", async () => {
    const { ai } = await score("Amos Lesson 1", CONTINUING, {
      answer: false,
      line: "",
    });
    const text = ai.sent.find((o) => !o.messages.some((m) => m.images?.length));
    const said = text?.messages.map((m) => m.content).join("\n") ?? "";
    expect(said).toContain("Amos Lesson 1");
    expect(said).toContain("firstLesson");
    expect(said).toMatch(/chapter number alone/i);
  });

  it("The session says it is the first lesson of a new study: the line that showed it is returned", async () => {
    const { result } = await score("Sat mornings", OPENING, {
      answer: true,
      line: "We're starting Amos this week",
    });
    expect(result.ok).toBe(true);
    expect(result.firstLessonLine).toBe("We're starting Amos this week");
  });

  it("The transcript says it in passing: a line partway through counts", async () => {
    const { result } = await score("Amos 1-2", IN_PASSING, {
      answer: true,
      line: "this week we started looking at Amos",
    });
    expect(result.firstLessonLine).toBe("this week we started looking at Amos");
  });

  it("The title says Lesson 1: the title is the line", async () => {
    const { result } = await score("Amos Lesson 1", CONTINUING, {
      answer: true,
      line: "Amos Lesson 1",
    });
    expect(result.firstLessonLine).toBe("Amos Lesson 1");
  });

  it("A chapter one is not a first lesson: a no leaves Memory Reinforcement to be scored", async () => {
    const { result } = await score("Jonah 1", CONTINUING, {
      answer: false,
      line: "",
    });
    expect(result.firstLessonLine).toBeNull();
    expect(result.dimensions?.find((d) => d.n === 9)?.score).toBe(4);
  });

  it("a line copied with its time and speaker, as the model sees it, still shows the first lesson", async () => {
    const { result } = await score("Sat mornings", OPENING, {
      answer: true,
      line: "[00:00:04] LEADER: We're starting Amos this week",
    });
    expect(result.firstLessonLine).toBe("We're starting Amos this week");
  });

  it("a line that says a new book begins counts even when it ends in a chapter number", async () => {
    for (const line of [
      "We're starting Amos 1",
      "Let's begin Romans 1",
      "Intro to Romans 1",
    ]) {
      const { result } = await score(line, CONTINUING, { answer: true, line });
      expect(result.firstLessonLine).toBe(line);
    }
  });

  it("a yes that cites only a book and chapter is not a first lesson", async () => {
    const { result } = await score("Jonah 1", CONTINUING, {
      answer: true,
      line: "Jonah 1",
    });
    expect(result.firstLessonLine).toBeNull();
    const spelled = await score("Song of Songs chapter 1", CONTINUING, {
      answer: true,
      line: "Song of Songs chapter 1",
    });
    expect(spelled.result.firstLessonLine).toBeNull();
  });

  it("a yes citing a line that is in neither the title nor the transcript is not a first lesson", async () => {
    const { result } = await score("Jonah 1", CONTINUING, {
      answer: true,
      line: "we're beginning Ruth today",
    });
    expect(result.firstLessonLine).toBeNull();
  });

  it("an answer that is missing or malformed is a no", async () => {
    for (const answer of [undefined, "yes", { answer: "true", line: 3 }]) {
      const { result } = await score("Amos Lesson 1", CONTINUING, answer);
      expect(result.ok).toBe(true);
      expect(result.firstLessonLine).toBeNull();
    }
  });

  it("the first-lesson rule is part of Memory Reinforcement's own text", () => {
    const memory = DIMENSIONS.find((d) => d.n === 9);
    expect(memory?.what).toMatch(/first lesson/i);
    expect(CoachScoringService.buildInstructions()).toContain(
      memory?.what ?? "missing",
    );
  });

  it("a class is the leader's weekday, still used for class days", () => {
    expect(classDay("2026-10-01")).toBe(4);
    expect(classDay("2026-10-03")).toBe(6);
  });
});

describe("first-lesson detection on a scored report", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a yes marks Memory Reinforcement not-applicable, recomputes, records the line and drops the Big Ideas review row", async () => {
    await seed(NEXT);
    expect(await detect(NEXT.id, "We're starting Amos this week")).toBe(true);
    const s = await state(NEXT.id);
    expect(s.first_lesson).toBe(true);
    expect(s.first_lesson_source).toBe("detected");
    expect(s.first_lesson_line).toBe("We're starting Amos this week");
    expect(s.dim9?.score).toBeNull();
    expect(s.dim9?.rationale).toBe(FIRST_LESSON_RATIONALE);
    expect(s.score).toBeCloseTo(allFoursWithoutNine(), 6);
    expect(s.rows.some((r) => r.startsWith(BIG_IDEAS_REVIEW_LABEL))).toBe(
      false,
    );
    expect(s.rows).toContain(
      "Overall Class Time: 1h 30m  (Target: 1.5-2h)  → ON TARGET",
    );
  });

  it("Nothing says it is a first lesson: the class's previous session is not consulted and Memory Reinforcement is scored", async () => {
    await seed(EARLIER);
    await seed(NEXT);
    expect(await detect(NEXT.id, null)).toBe(false);
    const s = await state(NEXT.id);
    expect(s.first_lesson).toBe(false);
    expect(s.first_lesson_line).toBeNull();
    expect(s.dim9?.score).toBe(4);
  });

  it("a later no on a re-score clears a detected flag", async () => {
    await seed(NEXT);
    await detect(NEXT.id, "We're starting Amos this week");
    await detect(NEXT.id, null);
    const s = await state(NEXT.id);
    expect(s.first_lesson).toBe(false);
    expect(s.first_lesson_source).toBeNull();
    expect(s.first_lesson_line).toBeNull();
  });

  it("a dimension 9 score a human corrected is kept, and the report is not flagged over it", async () => {
    await seed(NEXT);
    await conn
      .updateTable("coach_report_dimension_scores")
      .set({ provenance: "human", score: 3 })
      .where("report_id", "=", NEXT.id)
      .where("dimension_n", "=", 9)
      .execute();
    expect(await detect(NEXT.id, "We're starting Amos this week")).toBe(false);
    const s = await state(NEXT.id);
    expect(s.first_lesson).toBe(false);
    expect(s.dim9?.score).toBe(3);
  });

  it("an admin's decision is not overridden by a later re-score", async () => {
    await seed(NEXT);
    await new CoachReviewService(Database).setFirstLesson({
      reportId: NEXT.id,
      firstLesson: true,
      byUserId: null,
    });
    expect(await detect(NEXT.id, null)).toBe(true);
    expect((await state(NEXT.id)).first_lesson_source).toBe("admin");
  });
});

describe("the pipeline applies the scoring stage's first-lesson answer", () => {
  beforeEach(clear);
  afterEach(clear);

  async function runWith(
    firstLesson: unknown,
    parallelRun = false,
    body: Record<string, unknown> = {},
  ) {
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "ff-fl-pipeline",
        coach_id: COACH,
        matched_by: "title_match",
        title: "Thursday 7pm",
        session_date: "2026-10-01",
        session_started_at: "2026-10-02T00:00:00.000Z",
        state: "retained",
        parallel_run: parallelRun,
      })
      .execute();
    const client = {
      listTranscripts: async () => [],
      getTranscript: async () => ({
        id: "ff-fl-pipeline",
        title: "Thursday 7pm",
        host_email: "",
        organizer_email: "",
        dateString: "2026-10-02T00:00:00.000Z",
        duration: 60,
        audio_url: null,
        video_url: null,
        transcript_url: null,
        participantCount: 10,
        summary: {},
        sentences: [
          ...bodySentences(),
          {
            index: 99,
            speakerId: OPENING[0].speakerId,
            isLeader: true,
            text: OPENING[0].text,
            start_time: 2000,
            end_time: null,
          },
        ],
      }),
    };
    await new CoachPipelineService(Database, client as never, null, {
      scoring: new CoachScoringService(
        Database,
        new AnsweringAi(firstLesson, body),
      ),
      frames: {
        extract: async () => [{ data: new Uint8Array([1, 2, 3]) }],
      } as never,
    }).run();
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("report_id")
      .where("source_session_id", "=", "ff-fl-pipeline")
      .executeTakeFirstOrThrow();
    return state(row.report_id as string);
  }

  it("a yes marks the new report a first lesson with the line that showed it", async () => {
    const s = await runWith({
      answer: true,
      line: "We're starting Amos this week",
    });
    expect(s.first_lesson).toBe(true);
    expect(s.first_lesson_source).toBe("detected");
    expect(s.first_lesson_line).toBe("We're starting Amos this week");
    expect(s.dim9?.score).toBeNull();
    expect(s.score).toBeCloseTo(allFoursWithoutNine(), 6);
    expect(s.rows.some((r) => /^Big Ideas review/i.test(r))).toBe(false);
    expect(s.rows).toContain(
      "Overall Class Time: 1h 30m  (Target: 1.5-2h)  → ON TARGET",
    );
  });

  it("a detected first lesson reaches the body stage: an improvement asking to recall earlier lessons holds the report", async () => {
    const answer = JSON.parse(bodyAnswer()) as {
      improvements: Array<Record<string, unknown>>;
    };
    await runWith(
      { answer: true, line: "We're starting Amos this week" },
      false,
      {
        improvements: [
          {
            ...answer.improvements[0],
            title: "Recall last week's big ideas",
            line: "Open by asking the group to recall last week's big ideas.",
          },
          ...answer.improvements.slice(1),
        ],
      },
    );
    const session = await conn
      .selectFrom("coach_intake_sessions")
      .select(["state", "hold_reason"])
      .where("source_session_id", "=", "ff-fl-pipeline")
      .executeTakeFirstOrThrow();
    expect(session.hold_reason).toContain("cold-recall");
    expect(session.state).not.toBe("delivered");
  });

  it("a no keeps the Big Ideas review row the body stage wrote", async () => {
    const s = await runWith({ answer: false, line: "" });
    expect(s.rows).toContain(
      "Big Ideas review at open: 6 min (7%)  (Target: 5-10 min)  → ON TARGET",
    );
  });

  it("a detected first lesson reaches the parallel-run comparison as not-applicable on Memory Reinforcement, left out of the share", async () => {
    await seed({
      id: "fl-host-2026-10-01",
      date: "2026-10-01",
      session: "Thursday 7pm",
      legacy: true,
    });
    await runWith(
      { answer: true, line: "We're starting Amos this week" },
      true,
    );
    const compared = (await parallelRunComparison(Database)).sessions.find(
      (c) => c.coachId === COACH,
    );
    expect(compared?.dimensions.find((d) => d.n === 9)).toEqual({
      n: 9,
      host: 4,
      backend: null,
      difference: null,
    });
    expect(compared?.comparable).toBe(11);
    expect(compared?.backend.composite).toBeCloseTo(allFoursWithoutNine(), 6);
  });

  it("a no leaves the scored report exactly as scored", async () => {
    const s = await runWith({ answer: false, line: "" });
    expect(s.first_lesson).toBe(false);
    expect(s.dim9?.score).toBe(4);
  });
});

describe("an admin sets or clears the first-lesson flag", () => {
  beforeEach(clear);
  afterEach(clear);
  const review = new CoachReviewService(Database);
  const ROW = { value: "4 min (5%)", rating: "ON TARGET" } as const;

  it("An admin flags a first lesson the detection missed: dimension 9 not-applicable, recomputed, set by hand, Big Ideas review row removed", async () => {
    await seed(NEXT);
    const result = await review.setFirstLesson({
      reportId: NEXT.id,
      firstLesson: true,
      byUserId: null,
    });
    expect(result.ok).toBe(true);
    expect(result.firstLesson).toBe(true);
    expect(result.score).toBeCloseTo(allFoursWithoutNine(), 6);

    const s = await state(NEXT.id);
    expect(s.first_lesson).toBe(true);
    expect(s.first_lesson_source).toBe("admin");
    expect(s.dim9?.score).toBeNull();
    expect(s.dim9?.provenance).toBe("human");
    expect(s.score).toBeCloseTo(allFoursWithoutNine(), 6);
    expect(s.rows.some((r) => r.startsWith(BIG_IDEAS_REVIEW_LABEL))).toBe(
      false,
    );
    expect((await review.review(NEXT.id))?.firstLessonSource).toBe("admin");
  });

  it("An admin clears a wrong first-lesson flag: refused without a dimension 9 score and rationale", async () => {
    await seed(NEXT);
    await detect(NEXT.id, "We're starting Amos this week");

    for (const missing of [
      { score: null, rationale: "reviewed", bigIdeasReview: ROW },
      { score: 3, rationale: "  ", bigIdeasReview: ROW },
      { bigIdeasReview: ROW },
    ]) {
      const refused = await review.setFirstLesson({
        reportId: NEXT.id,
        firstLesson: false,
        byUserId: null,
        ...missing,
      });
      expect(refused.ok).toBe(false);
      expect(refused.refusal).toBe("memory-reinforcement-required");
    }
    expect((await state(NEXT.id)).first_lesson).toBe(true);
  });

  it("An admin clears the first-lesson flag: held until the Big Ideas review row's value and rating are supplied", async () => {
    await seed(NEXT);
    await detect(NEXT.id, "We're starting Amos this week");
    for (const row of [
      undefined,
      { value: " ", rating: "ON TARGET" },
      { value: "4 min", rating: "GREAT" },
    ]) {
      const refused = await review.setFirstLesson({
        reportId: NEXT.id,
        firstLesson: false,
        score: 2,
        rationale: "opened with a short recall of last week's big ideas",
        byUserId: null,
        ...(row ? { bigIdeasReview: row as never } : {}),
      });
      expect(refused.ok).toBe(false);
      expect(refused.refusal).toBe("big-ideas-review-required");
    }
    const s = await state(NEXT.id);
    expect(s.first_lesson).toBe(true);
    expect(s.dim9?.score).toBeNull();
  });

  it("An admin clears a wrong first-lesson flag: accepted with a score, a rationale and the row, human-corrected, recomputed", async () => {
    await seed(NEXT);
    await detect(NEXT.id, "We're starting Amos this week");

    const result = await review.setFirstLesson({
      reportId: NEXT.id,
      firstLesson: false,
      score: 2,
      rationale: "opened with a short recall of last week's big ideas",
      bigIdeasReview: ROW,
      byUserId: null,
    });
    expect(result.ok).toBe(true);

    const s = await state(NEXT.id);
    expect(s.first_lesson).toBe(false);
    expect(s.first_lesson_source).toBe("admin");
    expect(s.dim9?.score).toBe(2);
    expect(s.dim9?.provenance).toBe("human");
    expect(s.dim9?.rationale).toBe(
      "opened with a short recall of last week's big ideas",
    );
    expect(s.rows).toContain(
      `${BIG_IDEAS_REVIEW_LABEL}: 4 min (5%)  (Target: 5-10 min)  → ON TARGET`,
    );
    const expected = composeComposite(
      composeBaseScore(
        new Map(DIMENSIONS.map((d) => [d.n, d.n === 9 ? 2 : 4] as const)),
      ).base,
      { newcomerBonus: 0, sizeBonus: 0 },
    );
    expect(s.score).toBeCloseTo(expected, 6);
  });

  it("a legacy report refuses both setting and clearing", async () => {
    await seed(EARLIER);
    for (const input of [
      { firstLesson: true },
      { firstLesson: false, score: 3, rationale: "r", bigIdeasReview: ROW },
    ]) {
      const refused = await review.setFirstLesson({
        reportId: EARLIER.id,
        byUserId: null,
        ...input,
      });
      expect(refused.refusal).toBe("legacy-report");
    }
    expect((await state(EARLIER.id)).first_lesson).toBe(false);
  });
});
