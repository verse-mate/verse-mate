import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { AiProvider } from "../shared/ai";
import {
  FIRST_LESSON_RATIONALE,
  applyFirstLessonDetection,
  bookNamedIn,
  classDay,
  isFirstLesson,
  legacyReportBook,
} from "./coach-first-lesson";
import { CoachPipelineService } from "./coach-pipeline.service";
import { CoachReviewService } from "./coach-review.service";
import {
  CoachScoringService,
  type ScoringInput,
  type ScoringResult,
} from "./coach-scoring.service";
import type { CoachReportsWriter } from "./repository/coach-reports.repository";
import { DIMENSIONS, composeBaseScore, composeComposite } from "./rubric";

const conn = Database.getOrCreateConnection();
const COACH = "first-lesson-coach";

interface BundleReport {
  id: string;
  date: string;
  session: string;
  book?: string | null;
  legacy?: boolean;
}

const AVERY: BundleReport[] = [
  {
    id: "fl-avery-2026-09-24-thursday",
    date: "2026-09-24",
    session: "Lakeside Midweek Group (Zoom) — Jonah, Lesson 2 of 2",
    legacy: true,
  },
  {
    id: "fl-avery-2026-09-26-saturday",
    date: "2026-09-26",
    session: "Riverbend Sunday Group (Cedar Hollow) — Jonah, Lesson 2 of 2",
    legacy: true,
  },
  {
    id: "fl-avery-2026-10-01-thursday",
    date: "2026-10-01",
    session: "Thursday 7pm",
    book: "Amos",
  },
  {
    id: "fl-avery-2026-10-03-saturday",
    date: "2026-10-03",
    session: "Sat mornings",
    book: "Amos",
  },
];

async function seed(report: BundleReport, score = 4) {
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
      passage_book: report.book ?? null,
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
      body: {},
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

async function detect(report: BundleReport) {
  return conn
    .transaction()
    .execute((trx) =>
      applyFirstLessonDetection(
        trx as CoachReportsWriter,
        report.id,
        report.book ?? null,
      ),
    );
}

async function state(id: string) {
  const report = await conn
    .selectFrom("coach_reports")
    .select([
      "first_lesson",
      "first_lesson_source",
      "passage_book",
      "summary",
      "metrics",
    ])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  const dim9 = await conn
    .selectFrom("coach_report_dimension_scores")
    .select(["score", "rationale", "provenance", "corrected_by"])
    .where("report_id", "=", id)
    .where("dimension_n", "=", 9)
    .executeTakeFirst();
  return {
    ...report,
    score: (report.summary as { score?: number }).score,
    teachingCraft: (
      (report.metrics as { clusters?: Array<Record<string, unknown>> })
        .clusters ?? []
    ).find((c) => c.name === "Teaching Craft"),
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

describe("the first-lesson rule, as a pure function", () => {
  it("a different book from the class's previous session is a first lesson", () => {
    expect(isFirstLesson("Amos", "Jonah")).toBe(true);
    expect(isFirstLesson("Jonah 2", "Jonah 1")).toBe(false);
    expect(isFirstLesson("Amos", null)).toBe(false);
    expect(isFirstLesson(null, "Jonah")).toBe(false);
  });

  it("a legacy report's text names its book only when it names exactly one", () => {
    expect(
      bookNamedIn("Riverbend Sunday Group (Cedar Hollow) — Jonah, Lesson 2"),
    ).toBe("Jonah");
    expect(
      bookNamedIn(
        "Kings & Prophets Study, Part 4 — Jonah Lesson 1 (Jonah 1-2)",
      ),
    ).toBe("Jonah");
    expect(bookNamedIn("Revelation 1 & Daniel 7 — Who Is Jesus?")).toBeNull();
    expect(bookNamedIn("1 John 2 — Walking in the light")).toBe("1 John");
    expect(bookNamedIn("Sat mornings")).toBeNull();
  });

  it("a class is the leader's weekday, so Thursday and Saturday are two classes", () => {
    expect(classDay("2026-10-01")).toBe(4);
    expect(classDay("2026-10-03")).toBe(6);
  });
});

describe("the bundle's October first lessons against their classes' Jonah sessions", () => {
  const cases: Array<[string, string, string, string]> = [
    [
      "avery-hollis",
      "2026-10-01",
      "2026-09-24",
      "Lakeside Midweek Group (Zoom) — Jonah, Lesson 2 of 2",
    ],
    [
      "avery-hollis",
      "2026-10-03",
      "2026-09-26",
      "Riverbend Sunday Group (Cedar Hollow) — Jonah, Lesson 2 of 2",
    ],
    [
      "reid-thorne",
      "2026-10-03",
      "2026-09-19",
      "Jonah 1:1-2:10 — Fleeing God's Presence (New Book, Lesson 1)",
    ],
    [
      "hal-brin",
      "2026-10-03",
      "2026-09-26",
      "Jonah 3-4 — Nineveh's repentance, Jonah's anger (book closes)",
    ],
    [
      "simon-ortiz",
      "2026-10-03",
      "2026-09-26",
      "Jonah 3-4 — Second Chance, Nineveh's Repentance",
    ],
    [
      "lachlan-genevieve",
      "2026-10-03",
      "2026-09-26",
      "Kings & Prophets Study, Part 4 — Jonah Lesson 2 (Jonah 3-4)",
    ],
  ];

  it.each(cases)(
    "%s %s starts Amos after the same class's Jonah session",
    (_leader, date, previousDate, previousSession) => {
      expect(classDay(date)).toBe(classDay(previousDate));
      const previousBook = legacyReportBook({ session: previousSession });
      expect(previousBook).toBe("Jonah");
      expect(isFirstLesson("Amos", previousBook)).toBe(true);
      expect(isFirstLesson("Jonah", previousBook)).toBe(false);
    },
  );
});

describe("first-lesson detection on a scored report", () => {
  beforeEach(clear);
  afterEach(clear);

  it("The leader starts a new book: Memory Reinforcement is not-applicable and Teaching Craft is scored over the rest", async () => {
    const previous = { ...AVERY[0], legacy: false, book: "Jonah" };
    const current = AVERY[2];
    await seed(previous);
    await seed(current);

    expect(await detect(current)).toBe(true);

    const s = await state(current.id);
    expect(s.first_lesson).toBe(true);
    expect(s.first_lesson_source).toBe("detected");
    expect(s.passage_book).toBe("Amos");
    expect(s.dim9?.score).toBeNull();
    expect(s.dim9?.rationale).toBe(FIRST_LESSON_RATIONALE);
    expect(s.teachingCraft?.scorePct).toBeCloseTo(80, 6);
    expect(s.score).toBeCloseTo(allFoursWithoutNine(), 6);
  });

  it("The leader continues the same book: Memory Reinforcement is scored", async () => {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah 1" });
    const current = { ...AVERY[2], book: "Jonah 2" };
    await seed(current);

    expect(await detect(current)).toBe(false);
    const s = await state(current.id);
    expect(s.first_lesson).toBe(false);
    expect(s.dim9?.score).toBe(4);
  });

  it("A leader with two classes starts the same book in one week: both are first lessons", async () => {
    for (const r of AVERY) await seed(r);

    expect(await detect(AVERY[2])).toBe(true);
    expect(await detect(AVERY[3])).toBe(true);

    expect((await state(AVERY[2].id)).first_lesson).toBe(true);
    expect((await state(AVERY[3].id)).first_lesson).toBe(true);
  });

  it("No previous session: not detected, Memory Reinforcement is scored", async () => {
    await seed(AVERY[2]);
    expect(await detect(AVERY[2])).toBe(false);
    expect((await state(AVERY[2].id)).dim9?.score).toBe(4);
  });

  it("A previous legacy report whose text names no single book: not detected", async () => {
    await seed({
      id: "fl-two-books",
      date: "2026-09-24",
      session: "Revelation 1 & Daniel 7 — Who Is Jesus?",
      legacy: true,
    });
    await seed(AVERY[2]);
    expect(await detect(AVERY[2])).toBe(false);
    expect((await state(AVERY[2].id)).dim9?.score).toBe(4);
  });

  it("No book on the scored report (today, always): nothing changes", async () => {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah" });
    const current = { ...AVERY[2], book: null };
    await seed(current);
    expect(await detect(current)).toBe(false);
    const s = await state(current.id);
    expect(s.first_lesson).toBe(false);
    expect(s.first_lesson_source).toBeNull();
    expect(s.passage_book).toBeNull();
    expect(s.dim9?.score).toBe(4);
  });

  it("An earlier session is scored late: the later-dated report keeps its first-lesson outcome", async () => {
    await seed({
      id: "fl-sat-0919",
      date: "2026-09-19",
      session: "Riverbend Sunday Group (Cedar Hollow) — Jonah, Lesson 1 of 2",
      legacy: true,
    });
    const later = AVERY[3];
    await seed(later);
    expect(await detect(later)).toBe(true);

    const late = {
      id: "fl-sat-0926-late",
      date: "2026-09-26",
      session: "Sat mornings",
      book: "Amos",
    };
    await seed(late);
    expect(await detect(late)).toBe(true);

    const s = await state(later.id);
    expect(s.first_lesson).toBe(true);
    expect(s.first_lesson_source).toBe("detected");
    expect(s.dim9?.score).toBeNull();
  });

  it("the previous session is the latest one: an older session's book is not read when the latest names none", async () => {
    await seed({
      ...AVERY[0],
      id: "fl-thu-0917",
      date: "2026-09-17",
      legacy: false,
      book: "Jonah",
    });
    await seed({ ...AVERY[0], legacy: false, book: null });
    await seed(AVERY[2]);
    expect(await detect(AVERY[2])).toBe(false);
    expect((await state(AVERY[2].id)).dim9?.score).toBe(4);
  });

  it("a report of the same day is not the previous session", async () => {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah" });
    await seed({
      id: "fl-thu-1001-host",
      date: AVERY[2].date,
      session: "Lakeside Midweek Group (Zoom) — Amos, Lesson 1",
      legacy: true,
    });
    await seed(AVERY[2]);
    expect(await detect(AVERY[2])).toBe(true);
  });

  it("a dimension 9 score a human corrected is kept, and the report is not flagged over it", async () => {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah" });
    await seed(AVERY[2]);
    await new CoachReviewService(Database).correct({
      reportId: AVERY[2].id,
      dimensionN: 9,
      score: 3,
      rationale: "opened by reviewing the book's big ideas",
      correctedByUserId: null,
    });
    expect(await detect(AVERY[2])).toBe(false);
    const s = await state(AVERY[2].id);
    expect(s.first_lesson).toBe(false);
    expect(s.first_lesson_source).toBeNull();
    expect(s.dim9?.score).toBe(3);
    expect(s.dim9?.provenance).toBe("human");
  });

  it("an admin's decision is not overridden by a later re-score", async () => {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah" });
    await seed(AVERY[2]);
    const review = new CoachReviewService(Database);
    await review.setFirstLesson({
      reportId: AVERY[2].id,
      firstLesson: false,
      score: 3,
      rationale: "they reviewed last week's big ideas",
      byUserId: null,
    });
    await detect(AVERY[2]);
    const s = await state(AVERY[2].id);
    expect(s.first_lesson).toBe(false);
    expect(s.first_lesson_source).toBe("admin");
    expect(s.dim9?.score).toBe(3);
  });
});

describe("the pipeline applies detection when scoring returns a book", () => {
  beforeEach(clear);
  afterEach(clear);

  class BookScoring extends CoachScoringService {
    constructor(private readonly book: string | undefined) {
      super(Database, {} as AiProvider);
    }
    override async scoreSession(_input: ScoringInput): Promise<ScoringResult> {
      const dimensions = DIMENSIONS.map((d) => ({
        n: d.n,
        name: d.name,
        score: 4,
        note: `machine ${d.n}`,
      }));
      const { base, clusters } = composeBaseScore(
        new Map(dimensions.map((d) => [d.n, d.score])),
      );
      return {
        ok: true,
        base,
        clusters,
        dimensions,
        newcomers: 0,
        ...(this.book ? { passageBook: this.book } : {}),
      };
    }
  }

  async function runWith(book: string | undefined) {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah" });
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "ff-fl-pipeline",
        coach_id: COACH,
        matched_by: "title_match",
        title: "Thursday 7pm",
        session_date: "2026-10-01",
        state: "retained",
      })
      .execute();
    const client = {
      listTranscripts: async () => [],
      getTranscript: async () => ({
        id: "ff-fl-pipeline",
        title: "Thursday 7pm",
        host_email: "",
        organizer_email: "",
        dateString: "2026-10-01T23:00:00.000Z",
        duration: 60,
        audio_url: null,
        video_url: null,
        transcript_url: null,
        participantCount: 10,
        summary: {},
        sentences: [],
      }),
    };
    await new CoachPipelineService(Database, client as never, null, {
      scoring: new BookScoring(book),
      frames: { extract: async () => [] } as never,
    }).run();
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("report_id")
      .where("source_session_id", "=", "ff-fl-pipeline")
      .executeTakeFirstOrThrow();
    return state(row.report_id as string);
  }

  it("a book different from the class's previous session marks the new report a first lesson", async () => {
    const s = await runWith("Amos");
    expect(s.first_lesson).toBe(true);
    expect(s.first_lesson_source).toBe("detected");
    expect(s.dim9?.score).toBeNull();
    expect(s.score).toBeCloseTo(allFoursWithoutNine(), 6);
  });

  it("with no book, the scored report is left exactly as scored", async () => {
    const s = await runWith(undefined);
    expect(s.first_lesson).toBe(false);
    expect(s.dim9?.score).toBe(4);
  });
});

describe("an admin sets or clears the first-lesson flag", () => {
  beforeEach(clear);
  afterEach(clear);
  const review = new CoachReviewService(Database);

  it("An admin flags a first lesson the detection missed: dimension 9 not-applicable, recomputed, set by hand", async () => {
    await seed(AVERY[2]);
    const result = await review.setFirstLesson({
      reportId: AVERY[2].id,
      firstLesson: true,
      byUserId: null,
    });
    expect(result.ok).toBe(true);
    expect(result.firstLesson).toBe(true);
    expect(result.score).toBeCloseTo(allFoursWithoutNine(), 6);

    const s = await state(AVERY[2].id);
    expect(s.first_lesson).toBe(true);
    expect(s.first_lesson_source).toBe("admin");
    expect(s.dim9?.score).toBeNull();
    expect(s.dim9?.provenance).toBe("human");
    expect(s.score).toBeCloseTo(allFoursWithoutNine(), 6);
    expect((await review.review(AVERY[2].id))?.firstLessonSource).toBe("admin");
  });

  it("An admin clears a wrong first-lesson flag: refused without a dimension 9 score and rationale", async () => {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah" });
    await seed(AVERY[2]);
    await detect(AVERY[2]);

    for (const missing of [
      { score: null, rationale: "reviewed" },
      { score: 3, rationale: "  " },
      {},
    ]) {
      const refused = await review.setFirstLesson({
        reportId: AVERY[2].id,
        firstLesson: false,
        byUserId: null,
        ...missing,
      });
      expect(refused.ok).toBe(false);
      expect(refused.refusal).toBe("memory-reinforcement-required");
    }
    expect((await state(AVERY[2].id)).first_lesson).toBe(true);
  });

  it("An admin clears a wrong first-lesson flag: accepted with a score and rationale, human-corrected, recomputed", async () => {
    await seed({ ...AVERY[0], legacy: false, book: "Jonah" });
    await seed(AVERY[2]);
    await detect(AVERY[2]);

    const result = await review.setFirstLesson({
      reportId: AVERY[2].id,
      firstLesson: false,
      score: 2,
      rationale: "opened with a short recall of last week's big ideas",
      byUserId: null,
    });
    expect(result.ok).toBe(true);

    const s = await state(AVERY[2].id);
    expect(s.first_lesson).toBe(false);
    expect(s.first_lesson_source).toBe("admin");
    expect(s.dim9?.score).toBe(2);
    expect(s.dim9?.provenance).toBe("human");
    expect(s.dim9?.rationale).toBe(
      "opened with a short recall of last week's big ideas",
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
    await seed(AVERY[0]);
    for (const input of [
      { firstLesson: true },
      { firstLesson: false, score: 3, rationale: "r" },
    ]) {
      const refused = await review.setFirstLesson({
        reportId: AVERY[0].id,
        byUserId: null,
        ...input,
      });
      expect(refused.refusal).toBe("legacy-report");
    }
    expect((await state(AVERY[0].id)).first_lesson).toBe(false);
  });
});
