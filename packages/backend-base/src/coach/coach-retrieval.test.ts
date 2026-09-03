import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import type { RetainResult } from "./coach-archive.service";
import {
  CoachRetrievalService,
  RETRIEVAL_ATTEMPT_LIMIT,
} from "./coach-retrieval.service";

const conn = Database.getOrCreateConnection();
const COACH = "retrieval-coach";

/**
 * Stands in for the archive: answers whatever the test queues up, and honours
 * the part of the real contract this service depends on, a successful retain
 * moves the session to `retained` (the archive owns that transition, not the
 * retrieval sweep). A double that skipped it would let the sweep look correct
 * while production disagreed.
 */
class FakeArchive {
  calls = 0;
  constructor(private results: RetainResult[]) {}
  async retain(sourceSessionId: string): Promise<RetainResult> {
    this.calls += 1;
    const outcome = this.results.shift() ?? {
      retained: false,
      reason: "retrieval-failed" as const,
    };
    if (outcome.retained) {
      await conn
        .updateTable("coach_intake_sessions")
        .set({ state: "retained" })
        .where("source_session_id", "=", sourceSessionId)
        .execute();
    }
    return outcome;
  }
}

async function seed(id: string, over: Record<string, unknown> = {}) {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: COACH,
      matched_by: "title_match",
      title: "Session",
      session_date: "2026-08-22",
      state: "observed",
      ...over,
    })
    .execute();
}

async function row(id: string) {
  return conn
    .selectFrom("coach_intake_sessions")
    .selectAll()
    .where("source_session_id", "=", id)
    .executeTakeFirstOrThrow();
}

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "=", COACH)
    .execute();
}

function service(results: RetainResult[]) {
  const archive = new FakeArchive(results);
  return { svc: new CoachRetrievalService(Database, archive as any), archive };
}

describe("a session whose video is not ready is HELD, not failed", () => {
  beforeEach(clear);
  afterEach(clear);

  it("the first miss holds the session and counts the attempt", async () => {
    await seed("ff-1");
    const { svc } = service([{ retained: false, reason: "no-video" }]);

    await svc.sweep();
    const r = await row("ff-1");
    expect(r.state).toBe("held");
    expect(r.retry_count).toBe(1);
    // No report can exist yet: no report at all without retained material.
    expect(r.report_id).toBeNull();
  });

  it("retrieval succeeding on a later attempt produces the report path normally", async () => {
    await seed("ff-1");
    const { svc, archive } = service([
      { retained: false, reason: "no-video" },
      { retained: true, recordingBytes: 10 },
    ]);

    await svc.sweep();
    expect((await row("ff-1")).state).toBe("held");
    await svc.sweep();

    const r = await row("ff-1");
    expect(r.state).toBe("retained");
    expect(archive.calls).toBe(2);
  });

  it("at the stated limit the session becomes a retrieval FAILURE with a pending re-share", async () => {
    await seed("ff-1");
    const { svc } = service(
      Array.from({ length: RETRIEVAL_ATTEMPT_LIMIT }, () => ({
        retained: false as const,
        reason: "retrieval-failed" as const,
      })),
    );

    for (let i = 0; i < RETRIEVAL_ATTEMPT_LIMIT; i += 1) await svc.sweep();

    const r = await row("ff-1");
    expect(r.retry_count).toBe(RETRIEVAL_ATTEMPT_LIMIT);
    expect(r.state).toBe("retrieval_failed");
    expect(r.reshare_requested_at).toBeTruthy();
    expect(r.reshare_resolved_at).toBeNull();
  });

  it("a failed session is NOT retried forever, the sweep leaves it alone", async () => {
    await seed("ff-1", {
      state: "retrieval_failed",
      retry_count: RETRIEVAL_ATTEMPT_LIMIT,
      reshare_requested_at: new Date(),
    });
    const { svc, archive } = service([{ retained: true }]);

    await svc.sweep();
    expect(archive.calls).toBe(0);
    expect((await row("ff-1")).state).toBe("retrieval_failed");
  });

  it("a provider refusing to serve the bytes, download disabled, is the same failure path", async () => {
    // The system never works around a provider-side restriction; it retries to
    // the stated limit and then asks the leader to re-share.
    await seed("ff-1");
    const { svc } = service(
      Array.from({ length: RETRIEVAL_ATTEMPT_LIMIT }, () => ({
        retained: false as const,
        reason: "retrieval-failed" as const,
      })),
    );
    for (let i = 0; i < RETRIEVAL_ATTEMPT_LIMIT; i += 1) await svc.sweep();
    expect((await row("ff-1")).reshare_requested_at).toBeTruthy();
  });
});

describe("a pending re-share is visible, and there is a way back in", () => {
  beforeEach(clear);
  afterEach(clear);

  it("pending requests are listable for an admin surface", async () => {
    await seed("ff-1", {
      state: "retrieval_failed",
      retry_count: RETRIEVAL_ATTEMPT_LIMIT,
      reshare_requested_at: new Date(),
    });
    await seed("ff-2");
    const { svc } = service([]);

    const pending = await svc.pendingReshares();
    expect(pending.map((p) => p.sourceSessionId)).toEqual(["ff-1"]);
  });

  it("a resolved request re-enters retrieval and is not listed again", async () => {
    await seed("ff-1", {
      state: "retrieval_failed",
      retry_count: RETRIEVAL_ATTEMPT_LIMIT,
      reshare_requested_at: new Date(),
    });
    const { svc, archive } = service([{ retained: true }]);

    await svc.resolveReshare("ff-1");
    const r = await row("ff-1");
    expect(r.reshare_resolved_at).toBeTruthy();
    expect(r.state).toBe("observed");
    // The counter resets, or the session would fail again on its next attempt.
    expect(r.retry_count).toBe(0);
    expect(await svc.pendingReshares()).toEqual([]);

    // …and the next sweep picks it up.
    await svc.sweep();
    expect(archive.calls).toBe(1);
    expect((await row("ff-1")).state).toBe("retained");
  });

  it("the re-shared recording produces NO duplicate, it is the same source session", async () => {
    // Intake idempotence does the work: the session keeps its id, so whatever
    // report it produces upserts on the same natural key (task 2.4).
    await seed("ff-1", {
      state: "retrieval_failed",
      retry_count: RETRIEVAL_ATTEMPT_LIMIT,
      reshare_requested_at: new Date(),
    });
    const { svc } = service([{ retained: true }]);

    await svc.resolveReshare("ff-1");
    await svc.sweep();

    const all = await conn
      .selectFrom("coach_intake_sessions")
      .select("source_session_id")
      .where("coach_id", "=", COACH)
      .execute();
    expect(all.length).toBe(1);
    expect(all[0].source_session_id).toBe("ff-1");
  });

  it("resolving an unknown session changes nothing", async () => {
    const { svc } = service([]);
    expect(await svc.resolveReshare("nope")).toBe(false);
  });
});
