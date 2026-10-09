import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { reattributeSession } from "./coach-attribution";
import {
  type ParallelRunComparison,
  compareScores,
  parallelRunComparison,
} from "./coach-parallel-run";
import { legacySourceSessionId } from "./coach-store.transform";
import { composeBaseScore, composeComposite } from "./rubric";

const conn = Database.getOrCreateConnection();
const A = "parallel-leader-a";
const B = "parallel-leader-b";
const LEADERS = [A, B];

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", "ff-parallel-%")
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", LEADERS)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", LEADERS).execute();
}

const twelve = (first: Array<number | null>, rest: number | null = 4) =>
  Array.from({ length: 12 }, (_, i) => (i < first.length ? first[i] : rest));

async function host(
  coachId: string,
  date: string,
  composite: number | null,
  dims: Array<number | null>,
  ordinal = 0,
) {
  const id = `host-${coachId}-${date}-${ordinal}`;
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: coachId,
      session_date: date,
      source_session_id: legacySourceSessionId(coachId, date, ordinal),
      legacy_ids: [],
      summary: composite === null ? {} : { score: composite },
      metrics: JSON.stringify({
        dimensions: dims.map((score, i) => ({ n: i + 1, score, note: "r" })),
      }),
      body: {},
    })
    .execute();
  return id;
}

async function backend(
  sourceSessionId: string,
  coachId: string,
  date: string,
  machine: Array<number | null>,
  corrected: Array<number | null> = machine,
) {
  const reportId = `backend-${sourceSessionId}`;
  await conn
    .insertInto("coach_reports")
    .values({
      id: reportId,
      coach_id: coachId,
      session_date: date,
      source_session_id: sourceSessionId,
      legacy_ids: [],
      summary: {},
      metrics: JSON.stringify({ newcomerBonus: 1, sizeBonus: 0.5 }),
      body: {},
      held: true,
    })
    .execute();
  await conn
    .insertInto("coach_report_dimension_scores")
    .values(
      machine.map((score, i) => ({
        report_id: reportId,
        dimension_n: i + 1,
        score: corrected[i],
        machine_score: score,
        rationale: "r",
        provenance: corrected[i] === score ? "machine" : "human",
      })),
    )
    .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: sourceSessionId,
      coach_id: coachId,
      matched_by: "title_match",
      title: "t",
      session_date: date,
      state: "scored",
      report_id: reportId,
      parallel_run: true,
    })
    .execute();
  return reportId;
}

function machineComposite(scores: Array<number | null>) {
  const { base } = composeBaseScore(new Map(scores.map((s, i) => [i + 1, s])));
  return composeComposite(base, { newcomerBonus: 1, sizeBonus: 0.5 });
}

async function read(): Promise<ParallelRunComparison> {
  const all = await parallelRunComparison(Database);
  const ours = (c: string | null) => c !== null && LEADERS.includes(c);
  return {
    ...all,
    sessions: all.sessions.filter((s) => ours(s.coachId)),
    needsPairing: all.needsPairing.filter((s) => ours(s.coachId)),
    unmatched: {
      backend: all.unmatched.backend.filter((s) => ours(s.coachId)),
      host: all.unmatched.host.filter((s) => ours(s.coachId)),
    },
  };
}

describe("Machine Scores Are Compared With The Host's During The Parallel Run", () => {
  beforeEach(async () => {
    await clear();
    await conn
      .insertInto("coach_leaders")
      .values(
        LEADERS.map((slug) => ({
          slug,
          email: `${slug}@example.test`,
          name: slug,
        })),
      )
      .execute();
  });
  afterEach(clear);

  it("A session both systems scored: host 78.0 with 4, 3, 5 against backend 74.5 with 4, 4, not-applicable differs by 3.5, 2 of 2 within one, not flagged", () => {
    const compared = compareScores(
      { composite: 78.0, dimensions: [4, 3, 5] },
      { composite: 74.5, dimensions: [4, 4, null] },
    );
    expect(compared.compositeDifference).toBe(3.5);
    expect(compared.dimensions).toEqual([
      { n: 1, host: 4, backend: 4, difference: 0 },
      { n: 2, host: 3, backend: 4, difference: 1 },
      { n: 3, host: 5, backend: null, difference: null },
    ]);
    expect(compared.withinOne).toBe(2);
    expect(compared.comparable).toBe(2);
    expect(compared.flagged).toBe(false);
  });

  it("matches the backend's session to the host's report on leader and date, using the machine scores before any admin correction", async () => {
    const machine = twelve([4, 4, null]);
    await backend(
      "ff-parallel-1",
      A,
      "2026-10-01",
      machine,
      twelve([2, 4, null]),
    );
    const hostId = await host(A, "2026-10-01", 78.0, twelve([4, 3, 5]));

    const { sessions, unmatched } = await read();
    expect(unmatched).toEqual({ backend: [], host: [] });
    expect(sessions).toHaveLength(1);
    const [s] = sessions;
    expect(s).toMatchObject({
      coachId: A,
      date: "2026-10-01",
      backend: {
        sourceSessionId: "ff-parallel-1",
        reportId: "backend-ff-parallel-1",
      },
      host: { reportId: hostId, composite: 78.0 },
    });
    expect(s.backend.composite).toBeCloseTo(machineComposite(machine), 6);
    expect(s.dimensions[0]).toEqual({
      n: 1,
      host: 4,
      backend: 4,
      difference: 0,
    });
    expect(s.dimensions[2]).toEqual({
      n: 3,
      host: 5,
      backend: null,
      difference: null,
    });
    expect(s.comparable).toBe(11);
  });

  it("A large difference is flagged: a composite more than 5 apart, or one dimension 2 apart", () => {
    expect(
      compareScores(
        { composite: 80, dimensions: [4] },
        { composite: 74.9, dimensions: [4] },
      ).flagged,
    ).toBe(true);
    expect(
      compareScores(
        { composite: 80, dimensions: [4] },
        { composite: 75, dimensions: [4] },
      ).flagged,
    ).toBe(false);
    expect(
      compareScores(
        { composite: 80, dimensions: [4, 5] },
        { composite: 80, dimensions: [4, 3] },
      ).flagged,
    ).toBe(true);
  });

  it("a host report with no composite is not compared on the composite: no difference, never flagged for it, its dimensions still compared", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([4, 4]));
    await host(A, "2026-10-01", null, twelve([4, 3]));
    const [s] = (await read()).sessions;
    expect(s.host.composite).toBeNull();
    expect(s.compositeDifference).toBeNull();
    expect(s.flagged).toBe(false);
    expect(s.comparable).toBe(12);
    expect(s.withinOne).toBe(12);

    await backend("ff-parallel-2", B, "2026-10-01", twelve([4, 2]));
    await host(B, "2026-10-01", null, twelve([4, 4]));
    expect((await read()).sessions.find((c) => c.coachId === B)?.flagged).toBe(
      true,
    );
  });

  it("The host's report arrives after the backend scored: the session moves from unmatched to compared", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([]));
    expect((await read()).unmatched.backend).toEqual([
      {
        coachId: A,
        date: "2026-10-01",
        sourceSessionId: "ff-parallel-1",
        reportId: "backend-ff-parallel-1",
      },
    ]);
    await host(A, "2026-10-01", 70, twelve([]));
    const after = await read();
    expect(after.unmatched.backend).toEqual([]);
    expect(after.sessions).toHaveLength(1);
  });

  it("The host's report is rewritten upstream: the comparison uses the rewritten values", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([]));
    const hostId = await host(A, "2026-10-01", 70, twelve([4]));
    await conn
      .updateTable("coach_reports")
      .set({
        summary: JSON.stringify({ score: 90 }),
        metrics: JSON.stringify({
          dimensions: twelve([1]).map((score, i) => ({ n: i + 1, score })),
        }),
      })
      .where("id", "=", hostId)
      .execute();
    const [s] = (await read()).sessions;
    expect(s.host.composite).toBe(90);
    expect(s.dimensions[0]).toEqual({
      n: 1,
      host: 1,
      backend: 4,
      difference: 3,
    });
    expect(s.flagged).toBe(true);
  });

  it("The backend's session is re-attributed: it is compared against the new leader's host report for the date", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([]));
    await host(B, "2026-10-01", 70, twelve([]));
    expect((await read()).sessions).toEqual([]);

    expect(
      await reattributeSession(Database, "ff-parallel-1", B, A),
    ).toMatchObject({ ok: true });
    const after = await read();
    expect(after.sessions.map((s) => s.coachId)).toEqual([B]);
    expect(after.unmatched).toEqual({ backend: [], host: [] });
  });

  it("Two sessions for one leader on one date: listed for an admin to pair, none compared by guess", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([]));
    await backend("ff-parallel-2", A, "2026-10-01", twelve([3]));
    const hostId = await host(A, "2026-10-01", 70, twelve([]));
    await host(B, "2026-10-02", 70, twelve([]));
    const hostB0 = `host-${B}-2026-10-02-0`;
    const hostB1 = await host(B, "2026-10-02", 71, twelve([]), 1);
    await backend("ff-parallel-3", B, "2026-10-02", twelve([]));

    const { sessions, needsPairing, counts } = await read();
    expect(sessions).toEqual([]);
    expect(needsPairing).toEqual([
      {
        coachId: A,
        date: "2026-10-01",
        backend: [
          {
            sourceSessionId: "ff-parallel-1",
            reportId: "backend-ff-parallel-1",
          },
          {
            sourceSessionId: "ff-parallel-2",
            reportId: "backend-ff-parallel-2",
          },
        ],
        host: [{ reportId: hostId }],
      },
      {
        coachId: B,
        date: "2026-10-02",
        backend: [
          {
            sourceSessionId: "ff-parallel-3",
            reportId: "backend-ff-parallel-3",
          },
        ],
        host: [{ reportId: hostB0 }, { reportId: hostB1 }],
      },
    ]);
    expect(counts.needsPairing).toBeGreaterThanOrEqual(2);
  });

  it("A session only one system scored, including one the two systems attributed to different leaders: each side is listed unmatched", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([]));
    const hostId = await host(B, "2026-10-01", 70, twelve([]));
    const { sessions, unmatched } = await read();
    expect(sessions).toEqual([]);
    expect(unmatched.backend.map((s) => s.sourceSessionId)).toEqual([
      "ff-parallel-1",
    ]);
    expect(unmatched.host).toEqual([
      { coachId: B, date: "2026-10-01", reportId: hostId },
    ]);
  });

  it("the overall share and counts add up across compared sessions", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([]));
    await host(A, "2026-10-01", machineComposite(twelve([])), twelve([]));
    await backend("ff-parallel-2", B, "2026-10-01", twelve([5, 5]));
    await host(B, "2026-10-01", 70, twelve([2, 4]));
    const all = await parallelRunComparison(Database);
    const ours = all.sessions.filter((s) => LEADERS.includes(s.coachId));
    expect(ours.map((s) => s.withinOne)).toEqual([12, 11]);
    expect(ours.map((s) => s.flagged)).toEqual([false, true]);
    expect(all.share.withinOne).toBe(
      all.sessions.reduce((n, s) => n + s.withinOne, 0),
    );
    expect(all.share.comparable).toBe(
      all.sessions.reduce((n, s) => n + s.comparable, 0),
    );
    expect(all.counts.compared).toBe(all.sessions.length);
    expect(all.counts.flagged).toBe(
      all.sessions.filter((s) => s.flagged).length,
    );
  });

  it("a session the backend scored while live is not part of the comparison", async () => {
    await backend("ff-parallel-1", A, "2026-10-01", twelve([]));
    await conn
      .updateTable("coach_intake_sessions")
      .set({ parallel_run: false })
      .where("source_session_id", "=", "ff-parallel-1")
      .execute();
    await host(A, "2026-10-02", 70, twelve([]));
    const { sessions, unmatched } = await read();
    expect(sessions).toEqual([]);
    expect(unmatched.backend).toEqual([]);
  });
});
