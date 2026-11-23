import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  type NotetakerComparison,
  notetakerComparison,
} from "./coach-notetaker-comparison";
import { DIMENSIONS, composeBaseScore, composeComposite } from "./rubric";

const conn = Database.getOrCreateConnection();
const A = "ntcmp-a";
const B = "ntcmp-b";
const C = "ntcmp-c";
const LEADERS = [A, B, C];

async function clear() {
  for (const like of ["ff-ntcmp-%", "notetaker:bot_ntcmp%"])
    await conn
      .deleteFrom("coach_intake_sessions")
      .where("source_session_id", "like", like)
      .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", LEADERS)
    .execute();
}

const twelve = (first: number[], rest = 4) =>
  DIMENSIONS.map((_, i) => (i < first.length ? first[i] : rest));

const composite = (scores: number[]) =>
  composeComposite(
    composeBaseScore(new Map(scores.map((s, i) => [i + 1, s]))).base,
    { newcomerBonus: 0, sizeBonus: 0 },
  );

async function session(
  id: string,
  coachId: string,
  date: string,
  opts: { classKey?: string; scores?: number[]; corrected?: number[] } = {},
) {
  const reportId = opts.scores ? `rep-${id}` : null;
  if (opts.scores) {
    await conn
      .insertInto("coach_reports")
      .values({
        id: reportId as string,
        coach_id: coachId,
        session_date: date,
        source_session_id: id,
        legacy_ids: [],
        summary: {},
        metrics: JSON.stringify({ newcomerBonus: 0, sizeBonus: 0 }),
        body: {},
        held: true,
      })
      .execute();
    const corrected = opts.corrected ?? opts.scores;
    await conn
      .insertInto("coach_report_dimension_scores")
      .values(
        opts.scores.map((machine, i) => ({
          report_id: reportId as string,
          dimension_n: i + 1,
          score: corrected[i],
          machine_score: machine,
          rationale: "r",
          provenance: corrected[i] === machine ? "machine" : "human",
        })),
      )
      .execute();
  }
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      source: id.startsWith("notetaker:") ? "notetaker" : "bot",
      coach_id: coachId,
      matched_by: "title_match",
      title: "t",
      session_date: date,
      state: opts.scores ? "scored" : "retained",
      report_id: reportId,
      class_key: opts.classKey ?? null,
      parallel_run: true,
    })
    .execute();
}

async function read(since = "2033-01-01"): Promise<NotetakerComparison> {
  const all = await notetakerComparison(Database, { enabled: true, since });
  const ours = (c: string | null) => c !== null && LEADERS.includes(c);
  return {
    ...all,
    pairs: all.pairs.filter((p) => ours(p.coachId)),
    needsPairing: all.needsPairing.filter((p) => ours(p.coachId)),
    unmatched: {
      fireflies: all.unmatched.fireflies.filter((p) => ours(p.coachId)),
      notetaker: all.unmatched.notetaker.filter((p) => ours(p.coachId)),
    },
  };
}

describe("the notetaker shadow is compared with the Fireflies bot, class by class", () => {
  beforeEach(clear);
  afterEach(clear);

  it("pairs the two recordings of a class on leader and date, on their MACHINE scores, renamed for the two bots", async () => {
    const bot = twelve([4, 3, 5]);
    const shadow = twelve([4, 4, 3]);
    await session("ff-ntcmp-1", A, "2033-03-01", {
      scores: bot,
      corrected: twelve([1, 1, 1]),
    });
    await session("notetaker:bot_ntcmp1", A, "2033-03-01", { scores: shadow });

    const { pairs, share, counts, enabled, since } = await read();
    expect(enabled).toBe(true);
    expect(since).toBe("2033-01-01");
    expect(pairs).toHaveLength(1);
    const [pair] = pairs;
    expect(pair).toMatchObject({
      coachId: A,
      date: "2033-03-01",
      fireflies: {
        sourceSessionId: "ff-ntcmp-1",
        state: "scored",
        reportId: "rep-ff-ntcmp-1",
        composite: composite(bot),
      },
      notetaker: {
        sourceSessionId: "notetaker:bot_ntcmp1",
        reportId: "rep-notetaker:bot_ntcmp1",
        composite: composite(shadow),
      },
    });
    expect(pair.comparison?.dimensions.slice(0, 3)).toEqual([
      { n: 1, fireflies: 4, notetaker: 4, difference: 0 },
      { n: 2, fireflies: 3, notetaker: 4, difference: 1 },
      { n: 3, fireflies: 5, notetaker: 3, difference: 2 },
    ]);
    expect(pair.comparison?.flagged).toBe(true);
    expect(pair.comparison?.flagReasons).toEqual(["dimension"]);
    expect(pair.comparison?.withinOne).toBe(11);
    expect(share.comparable).toBeGreaterThanOrEqual(12);
    expect(counts.compared).toBeGreaterThanOrEqual(1);
  });

  it("a pair not yet scored on both sides is listed with no comparison", async () => {
    await session("ff-ntcmp-1", A, "2033-03-01", { scores: twelve([]) });
    await session("notetaker:bot_ntcmp1", A, "2033-03-01");
    const { pairs } = await read();
    expect(pairs).toHaveLength(1);
    expect(pairs[0].notetaker).toMatchObject({
      state: "retained",
      reportId: null,
      composite: null,
    });
    expect(pairs[0].comparison).toBeNull();
  });

  it("a leader teaching twice that day is paired class by class, and what one bot alone recorded is unmatched", async () => {
    await session("ff-ntcmp-b1", B, "2033-03-02", { classKey: "class:1" });
    await session("ff-ntcmp-b2", B, "2033-03-02", { classKey: "class:2" });
    await session("notetaker:bot_ntcmpB2", B, "2033-03-02", {
      classKey: "class:2",
    });
    await session("notetaker:bot_ntcmpB1", B, "2033-03-02", {
      classKey: "class:1",
    });
    await session("ff-ntcmp-a9", A, "2033-03-09");
    await session("notetaker:bot_ntcmpA10", A, "2033-03-10");

    const { pairs, unmatched, needsPairing } = await read();
    expect(
      pairs.map((p) => [
        p.classKey,
        p.fireflies.sourceSessionId,
        p.notetaker.sourceSessionId,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["class:1", "ff-ntcmp-b1", "notetaker:bot_ntcmpB1"],
        ["class:2", "ff-ntcmp-b2", "notetaker:bot_ntcmpB2"],
      ]),
    );
    expect(pairs).toHaveLength(2);
    expect(needsPairing).toEqual([]);
    expect(unmatched.fireflies.map((s) => s.sourceSessionId)).toEqual([
      "ff-ntcmp-a9",
    ]);
    expect(unmatched.notetaker.map((s) => s.sourceSessionId)).toEqual([
      "notetaker:bot_ntcmpA10",
    ]);
  });

  it("two of one and one of the other on a leader's day, with nothing to tell them apart, waits for a person", async () => {
    await session("ff-ntcmp-c1", C, "2033-03-03");
    await session("ff-ntcmp-c2", C, "2033-03-03");
    await session("notetaker:bot_ntcmpC1", C, "2033-03-03");
    const { pairs, needsPairing } = await read();
    expect(pairs).toEqual([]);
    expect(needsPairing).toHaveLength(1);
    expect(needsPairing[0].fireflies.map((s) => s.sourceSessionId)).toEqual([
      "ff-ntcmp-c1",
      "ff-ntcmp-c2",
    ]);
    expect(needsPairing[0].notetaker.map((s) => s.sourceSessionId)).toEqual([
      "notetaker:bot_ntcmpC1",
    ]);
  });

  it("nothing before the start date is compared", async () => {
    await session("ff-ntcmp-1", A, "2033-03-01");
    await session("notetaker:bot_ntcmp1", A, "2033-03-01");
    const { pairs, unmatched } = await read("2033-03-02");
    expect(pairs).toEqual([]);
    expect(unmatched.fireflies).toEqual([]);
    expect(unmatched.notetaker).toEqual([]);
  });
});
