import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { sql } from "kysely";
import type { RetainResult } from "./coach-archive.service";

import {
  UNRESOLVED_SWEEP_DAYS,
  getLeaderAttribution,
  reattributeSession,
  reattributeUnresolved,
  setLeaderAttribution,
} from "./coach-attribution";
import { CoachIntakeService } from "./coach-intake.service";
import { CoachRetrievalService } from "./coach-retrieval.service";
import { CoachService, PIPELINE_FAILURES_MAX } from "./coach.service";
import type { FirefliesClient } from "./fireflies.client";
import { CoachReportsRepository } from "./repository/coach-reports.repository";

const conn = Database.getOrCreateConnection();
const RIGHT = "reattr-right";
const WRONG = "reattr-wrong";
const SESSIONS = ["ff-reattr-1", "ff-reattr-2", "ff-reattr-3"];

async function clear() {
  await conn
    .deleteFrom("coach_session_assets")
    .where("source_session_id", "in", SESSIONS)
    .execute();
  await conn
    .deleteFrom("coach_notes")
    .where("coach_id", "in", [RIGHT, WRONG])
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "in", SESSIONS)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("source_session_id", "in", SESSIONS)
    .execute();
  await conn
    .deleteFrom("coach_leaders")
    .where("slug", "in", [RIGHT, WRONG])
    .execute();
}

async function leaders() {
  await conn
    .insertInto("coach_leaders")
    .values([
      {
        slug: RIGHT,
        email: "reattr-right@example.test",
        name: "Ottoline Right",
      },
      {
        slug: WRONG,
        email: "reattr-wrong@example.test",
        name: "Wilfred Wrong",
      },
    ])
    .execute();
}

async function session(id: string, over: Record<string, unknown> = {}) {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: null,
      matched_by: "unresolved",
      title: "Tuesday night zephaniah circle",
      session_date: "2026-09-29",
      state: "observed",
      ...over,
    })
    .execute();
}

async function intake(id: string) {
  return conn
    .selectFrom("coach_intake_sessions")
    .selectAll()
    .where("source_session_id", "=", id)
    .executeTakeFirstOrThrow();
}

class RecordingArchive {
  retained: string[] = [];
  async retain(id: string): Promise<RetainResult> {
    this.retained.push(id);
    return { retained: false, reason: "retrieval-failed" };
  }
}

beforeEach(async () => {
  await clear();
  await leaders();
});
afterEach(clear);

describe("an unattributable session is not downloaded until it has a leader", () => {
  it("the retrieval sweep passes over a session with no leader", async () => {
    await session(SESSIONS[0]);
    await session(SESSIONS[1], { coach_id: RIGHT, matched_by: "title_match" });
    const archive = new RecordingArchive();
    await new CoachRetrievalService(Database, archive).sweep();
    expect(archive.retained).toContain(SESSIONS[1]);
    expect(archive.retained).not.toContain(SESSIONS[0]);
  });
});

describe("unresolved sessions appear on the admin failures list", () => {
  it("an unattributed session is listed with the attribute action", async () => {
    await session(SESSIONS[0]);
    const listed = (
      await new CoachService(Database).listPipelineFailures()
    ).sessions.find((s) => s.sourceSessionId === SESSIONS[0]);
    expect(listed).toMatchObject({
      coachId: null,
      state: "observed",
      action: "attribute",
      reason: "unattributed: no leader matched the session title",
    });
  });
});

describe("the failures list is paged", () => {
  it("a page holds at most the limit, newest first, with the total of every failure", async () => {
    await session(SESSIONS[0], { updated_at: new Date("2099-01-02") });
    await session(SESSIONS[1], { updated_at: new Date("2099-01-01") });
    const service = new CoachService(Database);
    const all = await service.listPipelineFailures({ limit: 200 });
    const first = await service.listPipelineFailures({ limit: 1 });
    const second = await service.listPipelineFailures({ limit: 1, offset: 1 });
    expect(first.sessions.map((s) => s.sourceSessionId)).toEqual([SESSIONS[0]]);
    expect(second.sessions.map((s) => s.sourceSessionId)).toEqual([
      SESSIONS[1],
    ]);
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(first.total).toBe(all.total);
    expect(second.total).toBe(first.total);
  });

  it("an unbounded request is capped", async () => {
    const page = await new CoachService(Database).listPipelineFailures({
      limit: 100_000,
    });
    expect(page.sessions.length).toBeLessThanOrEqual(PIPELINE_FAILURES_MAX);
  });
});

describe("the unresolved sweep is bounded", () => {
  it("a session observed before the sweep window is left for an admin to assign", async () => {
    await session(SESSIONS[0], {
      observed_at: sql`NOW() - ${sql.raw(`interval '${UNRESOLVED_SWEEP_DAYS + 1} days'`)}`,
    });
    await session(SESSIONS[1]);
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["zephaniah circle"] })
      .where("slug", "=", RIGHT)
      .execute();
    expect(await reattributeUnresolved(Database)).toBe(1);
    expect((await intake(SESSIONS[0])).coach_id).toBeNull();
    expect((await intake(SESSIONS[1])).coach_id).toBe(RIGHT);
  });

  it("one sweep resolves at most its limit, newest first", async () => {
    await session(SESSIONS[0], { observed_at: sql`NOW() - interval '2 days'` });
    await session(SESSIONS[1], { observed_at: sql`NOW() - interval '1 day'` });
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["zephaniah circle"] })
      .where("slug", "=", RIGHT)
      .execute();
    expect(await reattributeUnresolved(Database, { limit: 1 })).toBe(1);
    expect((await intake(SESSIONS[1])).coach_id).toBe(RIGHT);
    expect((await intake(SESSIONS[0])).coach_id).toBeNull();
  });
});

describe("an admin edits a leader's attribution keywords", () => {
  it("the keywords and alternate addresses are stored, normalized", async () => {
    const result = await setLeaderAttribution(Database, RIGHT, {
      titleMatch: [" Zephaniah Circle ", "zephaniah circle", "Tuesday NIGHT"],
      altEmails: [" Otto@Example.TEST "],
    });
    expect(result).toEqual({
      ok: true,
      titleMatch: ["zephaniah circle", "tuesday night"],
      altEmails: ["otto@example.test"],
      resolved: 0,
    });
    const row = await conn
      .selectFrom("coach_leaders")
      .select(["title_match", "alt_emails"])
      .where("slug", "=", RIGHT)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      title_match: ["zephaniah circle", "tuesday night"],
      alt_emails: ["otto@example.test"],
    });
  });

  it("the stored keywords and alternate addresses read back as written", async () => {
    await setLeaderAttribution(Database, RIGHT, {
      titleMatch: ["Zephaniah Circle"],
      altEmails: ["otto@example.test"],
    });
    expect(await getLeaderAttribution(Database, RIGHT)).toEqual({
      titleMatch: ["zephaniah circle"],
      altEmails: ["otto@example.test"],
    });
    expect(await getLeaderAttribution(Database, WRONG)).toEqual({
      titleMatch: [],
      altEmails: [],
    });
    expect(await getLeaderAttribution(Database, "reattr-nobody")).toBeNull();
  });

  it("an unknown leader is refused", async () => {
    expect(
      await setLeaderAttribution(Database, "reattr-nobody", {
        titleMatch: ["x y z"],
        altEmails: [],
      }),
    ).toEqual({ ok: false, refusal: "unknown-leader" });
  });

  it("an unresolved session whose title the new keyword matches resolves to that leader", async () => {
    await session(SESSIONS[0]);
    const result = await setLeaderAttribution(Database, RIGHT, {
      titleMatch: ["zephaniah circle"],
      altEmails: [],
    });
    expect(result).toMatchObject({ ok: true, resolved: 1 });
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: RIGHT,
      matched_by: "title_match",
      state: "observed",
    });
  });

  it("a poll re-resolves stored unresolved sessions against the current roster", async () => {
    await session(SESSIONS[0], { title: "Ottoline Right on Zephaniah" });
    const empty: FirefliesClient = { listTranscripts: async () => [] };
    await new CoachIntakeService(Database, empty).poll();
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: RIGHT,
      matched_by: "name",
    });
  });

  it("a session still ambiguous after the edit stays unresolved", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["zephaniah circle"] })
      .where("slug", "=", WRONG)
      .execute();
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["zephaniah circle"] })
      .where("slug", "=", RIGHT)
      .execute();
    await session(SESSIONS[0]);
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: null,
      matched_by: "unresolved",
    });
    expect(await reattributeUnresolved(Database)).toBe(0);
  });
});

describe("a keyword cannot claim another leader's sessions", () => {
  it("a keyword equal to another leader's keyword is refused, and nothing is stored", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["zephaniah circle"] })
      .where("slug", "=", WRONG)
      .execute();
    const result = await setLeaderAttribution(Database, RIGHT, {
      titleMatch: ["Zephaniah Circle", "tuesday"],
      altEmails: [],
    });
    expect(result).toEqual({
      ok: false,
      refusal: "keyword-conflict",
      conflicts: [
        { keyword: "zephaniah circle", leader: WRONG, inside: "keyword" },
      ],
    });
    expect(await getLeaderAttribution(Database, RIGHT)).toEqual({
      titleMatch: [],
      altEmails: [],
    });
  });

  it("a keyword inside another leader's keyword or name is refused", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: ["tuesday night circle"] })
      .where("slug", "=", WRONG)
      .execute();
    const result = await setLeaderAttribution(Database, RIGHT, {
      titleMatch: ["night circle", "wilfred"],
      altEmails: [],
    });
    expect(result).toEqual({
      ok: false,
      refusal: "keyword-conflict",
      conflicts: [
        { keyword: "night circle", leader: WRONG, inside: "keyword" },
        { keyword: "wilfred", leader: WRONG, inside: "name" },
      ],
    });
  });

  it("a keyword that only shares letters with another leader's words is accepted", async () => {
    const result = await setLeaderAttribution(Database, RIGHT, {
      titleMatch: ["wil"],
      altEmails: [],
    });
    expect(result).toMatchObject({ ok: true, titleMatch: ["wil"] });
  });
});

describe("keyword saves are serialized, so two admins cannot both pass the conflict check", () => {
  const ADDED = "reattr-added@example.test";
  const INVITER = "reattr-inviter@example.test";
  afterEach(async () => {
    await conn.deleteFrom("coach_leaders").where("email", "=", ADDED).execute();
    await conn.deleteFrom("user").where("email", "=", INVITER).execute();
  });

  async function whileAnotherSaveHoldsTheLock<T>(
    start: () => Promise<T>,
    commitOther: (trx: typeof conn) => Promise<unknown>,
  ): Promise<T> {
    let pending: Promise<T> | null = null;
    await conn.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext('coach_leader_keywords'))`.execute(
        trx,
      );
      pending = start();
      const finished = pending.then(() => true);
      for (let i = 0; i < 100; i += 1) {
        if (await Promise.race([finished, Promise.resolve(false)])) break;
        const waiting = await sql<{ n: string }>`
          SELECT count(*) AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query ILIKE '%pg_advisory_xact_lock%'`.execute(
          conn,
        );
        if (Number(waiting.rows[0].n) > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await commitOther(trx as unknown as typeof conn);
    });
    return pending as unknown as Promise<T>;
  }

  it("a keyword saved while another admin's overlapping save commits is refused", async () => {
    const result = await whileAnotherSaveHoldsTheLock(
      () =>
        setLeaderAttribution(Database, RIGHT, {
          titleMatch: ["zephaniah"],
          altEmails: [],
        }),
      (trx) =>
        trx
          .updateTable("coach_leaders")
          .set({ title_match: sql`ARRAY['zephaniah circle']::text[]` })
          .where("slug", "=", WRONG)
          .execute(),
    );
    expect(result).toEqual({
      ok: false,
      refusal: "keyword-conflict",
      conflicts: [{ keyword: "zephaniah", leader: WRONG, inside: "keyword" }],
    });
    expect(await getLeaderAttribution(Database, RIGHT)).toEqual({
      titleMatch: [],
      altEmails: [],
    });
  });

  it("a leader added while another admin's keyword save commits is refused", async () => {
    const inviter = await conn
      .insertInto("user")
      .values({ email: INVITER, firstName: "I", lastName: "N" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const result = await whileAnotherSaveHoldsTheLock(
      () =>
        new CoachService(Database).addLeader(inviter.id, {
          email: ADDED,
          name: "Grace Kim",
        }),
      (trx) =>
        trx
          .updateTable("coach_leaders")
          .set({ title_match: sql`ARRAY['grace']::text[]` })
          .where("slug", "=", WRONG)
          .execute(),
    );
    expect(result).toEqual({
      ok: false,
      reason: "keyword-conflict",
      conflicts: [{ keyword: "grace", leader: WRONG }],
    });
  });
});

describe("a session a keyword sweep attributes waits for an admin to release it", () => {
  it("the swept session is marked for release", async () => {
    await session(SESSIONS[0]);
    await setLeaderAttribution(Database, RIGHT, {
      titleMatch: ["zephaniah circle"],
      altEmails: [],
    });
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: RIGHT,
      release_required: true,
    });
  });
});

describe("an admin re-attributes a session to a leader", () => {
  it("an unresolved session is assigned, and the sweep then retrieves it", async () => {
    await session(SESSIONS[0]);
    expect(
      await reattributeSession(Database, SESSIONS[0], RIGHT, null),
    ).toEqual({
      ok: true,
      state: "observed",
    });
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: RIGHT,
      matched_by: "admin",
      state: "observed",
      release_required: true,
    });
    const archive = new RecordingArchive();
    await new CoachRetrievalService(Database, archive).sweep();
    expect(archive.retained).toContain(SESSIONS[0]);
  });

  it("a session scored under the wrong leader moves its report, keeps its id, and is scored again", async () => {
    await conn
      .insertInto("coach_reports")
      .values({
        id: "reattr-report-1",
        coach_id: WRONG,
        session_date: "2026-09-29",
        source_session_id: SESSIONS[0],
        legacy_ids: [],
        summary: { session: "Zephaniah", score: 70 },
        metrics: {},
        body: {},
        held: false,
      })
      .execute();
    await session(SESSIONS[0], {
      coach_id: WRONG,
      matched_by: "title_match",
      state: "delivered",
      report_id: "reattr-report-1",
      delivered_to: ["reattr-wrong@example.test"],
      published: true,
      retry_count: 2,
    });
    await conn
      .insertInto("coach_session_assets")
      .values({
        coach_id: WRONG,
        source_session_id: SESSIONS[0],
        report_id: "reattr-report-1",
        kind: "recording",
        storage_key: "coach/sessions/ff-reattr-1/recording.mp4",
      })
      .execute();
    await conn
      .insertInto("coach_notes")
      .values({
        coach_id: WRONG,
        report_id: "reattr-report-1",
        body: "note on the session",
      })
      .execute();

    expect(
      await reattributeSession(Database, SESSIONS[0], RIGHT, WRONG),
    ).toEqual({
      ok: true,
      state: "retained",
    });

    const report = await conn
      .selectFrom("coach_reports")
      .select(["id", "coach_id", "held"])
      .where("source_session_id", "=", SESSIONS[0])
      .execute();
    expect(report).toEqual([
      { id: "reattr-report-1", coach_id: RIGHT, held: true },
    ]);
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: RIGHT,
      matched_by: "admin",
      state: "retained",
      retry_count: 0,
      delivered_to: [],
      published: false,
      report_id: "reattr-report-1",
      release_required: true,
    });
    const asset = await conn
      .selectFrom("coach_session_assets")
      .select("coach_id")
      .where("source_session_id", "=", SESSIONS[0])
      .executeTakeFirstOrThrow();
    expect(asset.coach_id).toBe(RIGHT);
    const note = await conn
      .selectFrom("coach_notes")
      .select("coach_id")
      .where("report_id", "=", "reattr-report-1")
      .executeTakeFirstOrThrow();
    expect(note.coach_id).toBe(RIGHT);
    const reports = new CoachReportsRepository(Database);
    expect(
      (await reports.listFullReports(WRONG, { includeHeld: true })).map(
        (r) => r.id,
      ),
    ).toEqual([]);
  });

  it("an assignment made against a leader the session no longer has is refused and changes nothing", async () => {
    await session(SESSIONS[0], { coach_id: WRONG, state: "retained" });
    expect(
      await reattributeSession(Database, SESSIONS[0], RIGHT, null),
    ).toEqual({ ok: false, refusal: "attribution-changed" });
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: WRONG,
      state: "retained",
    });
    await session(SESSIONS[1]);
    expect(
      await reattributeSession(Database, SESSIONS[1], RIGHT, WRONG),
    ).toEqual({ ok: false, refusal: "attribution-changed" });
    expect(await intake(SESSIONS[1])).toMatchObject({ coach_id: null });
  });

  it("an unknown leader, an unknown session and an in-flight delivery are refused", async () => {
    await session(SESSIONS[0]);
    await session(SESSIONS[1], { coach_id: WRONG, state: "delivering" });
    expect(
      await reattributeSession(Database, SESSIONS[0], "reattr-nobody", null),
    ).toEqual({ ok: false, refusal: "unknown-leader" });
    expect(
      await reattributeSession(Database, "ff-reattr-none", RIGHT, null),
    ).toEqual({ ok: false, refusal: "unknown-session" });
    expect(
      await reattributeSession(Database, SESSIONS[1], RIGHT, WRONG),
    ).toEqual({
      ok: false,
      refusal: "in-flight",
    });
    expect(await intake(SESSIONS[1])).toMatchObject({ coach_id: WRONG });
  });
});

describe("a session is not re-assigned to the leader it already has", () => {
  it("the assignment is refused as already assigned, and nothing changes", async () => {
    await session(SESSIONS[0], { coach_id: RIGHT, state: "scored" });
    expect(
      await reattributeSession(Database, SESSIONS[0], RIGHT, RIGHT),
    ).toEqual({ ok: false, refusal: "already-assigned" });
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: RIGHT,
      state: "scored",
      release_required: false,
    });
  });
});

describe("a sweep never takes a session an admin assigned while it ran", () => {
  async function sweepWaiting() {
    for (let i = 0; i < 200; i += 1) {
      const waiting = await sql<{ n: string }>`
        SELECT count(*) AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock'
          AND query ILIKE 'update "coach_intake_sessions"%'`.execute(conn);
      if (Number(waiting.rows[0].n) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("the sweep never reached its update");
  }

  it("the sweep's update skips a session an admin assigned after the sweep read it", async () => {
    await session(SESSIONS[0]);
    await conn
      .updateTable("coach_leaders")
      .set({ title_match: sql`ARRAY['zephaniah circle']::text[]` })
      .where("slug", "=", RIGHT)
      .execute();
    let swept: Promise<number> | null = null;
    await conn.transaction().execute(async (trx) => {
      await trx
        .updateTable("coach_intake_sessions")
        .set({ coach_id: WRONG, matched_by: "admin", release_required: true })
        .where("source_session_id", "=", SESSIONS[0])
        .execute();
      swept = reattributeUnresolved(Database);
      await sweepWaiting();
    });
    expect(await (swept as unknown as Promise<number>)).toBe(0);
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: WRONG,
      matched_by: "admin",
    });
  });
});

describe("a session is assigned only to a coaching leader", () => {
  it("a roster row that is not a coach is refused as an unknown leader", async () => {
    await session(SESSIONS[0]);
    await conn
      .updateTable("coach_leaders")
      .set({ is_coach: false })
      .where("slug", "=", RIGHT)
      .execute();
    expect(
      await reattributeSession(Database, SESSIONS[0], RIGHT, null),
    ).toEqual({ ok: false, refusal: "unknown-leader" });
    expect(await intake(SESSIONS[0])).toMatchObject({ coach_id: null });
  });
});
