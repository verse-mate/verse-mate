import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { RetainResult } from "./coach-archive.service";
import {
  reattributeSession,
  reattributeUnresolved,
  setLeaderAttribution,
} from "./coach-attribution";
import { CoachIntakeService } from "./coach-intake.service";
import { CoachRetrievalService } from "./coach-retrieval.service";
import { CoachService } from "./coach.service";
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
    ).find((s) => s.sourceSessionId === SESSIONS[0]);
    expect(listed).toMatchObject({
      coachId: null,
      state: "observed",
      action: "attribute",
      reason: "unattributed: no leader matched the session title",
    });
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
    await session(SESSIONS[0]);
    const result = await setLeaderAttribution(Database, RIGHT, {
      titleMatch: ["zephaniah circle"],
      altEmails: [],
    });
    expect(result).toMatchObject({ ok: true, resolved: 0 });
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: null,
      matched_by: "unresolved",
    });
    expect(await reattributeUnresolved(Database)).toBe(0);
  });
});

describe("an admin re-attributes a session to a leader", () => {
  it("an unresolved session is assigned, and the sweep then retrieves it", async () => {
    await session(SESSIONS[0]);
    expect(await reattributeSession(Database, SESSIONS[0], RIGHT)).toEqual({
      ok: true,
      state: "observed",
    });
    expect(await intake(SESSIONS[0])).toMatchObject({
      coach_id: RIGHT,
      matched_by: "admin",
      state: "observed",
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

    expect(await reattributeSession(Database, SESSIONS[0], RIGHT)).toEqual({
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
      report_id: "reattr-report-1",
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

  it("an unknown leader, an unknown session and an in-flight delivery are refused", async () => {
    await session(SESSIONS[0]);
    await session(SESSIONS[1], { coach_id: WRONG, state: "delivering" });
    expect(
      await reattributeSession(Database, SESSIONS[0], "reattr-nobody"),
    ).toEqual({ ok: false, refusal: "unknown-leader" });
    expect(await reattributeSession(Database, "ff-reattr-none", RIGHT)).toEqual(
      { ok: false, refusal: "unknown-session" },
    );
    expect(await reattributeSession(Database, SESSIONS[1], RIGHT)).toEqual({
      ok: false,
      refusal: "in-flight",
    });
    expect(await intake(SESSIONS[1])).toMatchObject({ coach_id: WRONG });
  });
});
