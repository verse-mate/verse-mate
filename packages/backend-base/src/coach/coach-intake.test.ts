import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachIntakeService } from "./coach-intake.service";
import type { FirefliesClient, FirefliesTranscript } from "./fireflies.client";

const conn = Database.getOrCreateConnection();

const COACH_EMAIL = "intake-leader@example.test";
const COACH_SLUG = "intake-leader";

function transcript(
  id: string,
  over: Partial<FirefliesTranscript> = {},
): FirefliesTranscript {
  return {
    id,
    title: "Bryan — Saturday Morning, Austin Ridge",
    host_email: "fred@fireflies.ai",
    organizer_email: "fred@fireflies.ai",
    dateString: "2026-08-22T14:00:00.000Z",
    duration: 62,
    ...over,
  };
}

/** Records what the service asked for, so the watermark is observable. */
class FakeFireflies implements FirefliesClient {
  calls: Array<{ since: Date | null }> = [];
  constructor(private pages: FirefliesTranscript[][]) {}
  async listTranscripts(opts: {
    since: Date | null;
    limit: number;
  }): Promise<FirefliesTranscript[]> {
    this.calls.push({ since: opts.since });
    return this.pages.shift() ?? [];
  }
}

async function clear() {
  // Scoped: an unscoped wipe of the intake ledger strands every published
  // report's watermark, dedupe record and report_id link.
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", "ff-%")
    .execute();
  await conn
    .deleteFrom("coach_leaders")
    .where("email", "=", COACH_EMAIL)
    .execute();
}

async function seedLeader() {
  await conn
    .insertInto("coach_leaders")
    .values({
      slug: COACH_SLUG,
      email: COACH_EMAIL,
      name: "Bryan Bailey",
      title_match: ["austin ridge", "saturday morning"],
    })
    .execute();
}

describe("session intake polls the recording bot, not the leader's inbox", () => {
  beforeEach(async () => {
    await clear();
    await seedLeader();
  });
  afterEach(clear);

  it("a bot-covered leader's session arrives with the leader sending nothing", async () => {
    const client = new FakeFireflies([[transcript("ff-1")]]);
    const service = new CoachIntakeService(Database, client);

    const result = await service.poll();
    expect(result.observed).toBe(1);

    const rows = await conn
      .selectFrom("coach_intake_sessions")
      .selectAll()
      .execute();
    expect(rows.length).toBe(1);
    expect(rows[0].source_session_id).toBe("ff-1");
    expect(rows[0].state).toBe("observed");
    // Nothing was sent by the leader; the session is theirs all the same.
    expect(rows[0].coach_id).toBe(COACH_SLUG);
  });

  it("the first poll asks for everything; later polls carry a watermark", async () => {
    const client = new FakeFireflies([[transcript("ff-1")], []]);
    const service = new CoachIntakeService(Database, client);

    await service.poll();
    expect(client.calls[0].since).toBeNull();

    await service.poll();
    expect(client.calls[1].since).toBeInstanceOf(Date);
  });

  it("the watermark looks BACK past the newest session, so a late arrival is still seen", async () => {
    const client = new FakeFireflies([[transcript("ff-1")], []]);
    const service = new CoachIntakeService(Database, client);
    await service.poll();
    await service.poll();

    const observed = await conn
      .selectFrom("coach_intake_sessions")
      .select("observed_at")
      .executeTakeFirstOrThrow();
    const since = client.calls[1].since as Date;
    // Strictly earlier than what we have already seen, a watermark set to the
    // newest observation skips anything that lands a moment later.
    expect(since.getTime()).toBeLessThan(
      new Date(observed.observed_at).getTime(),
    );
  });

  it("re-polling the same session produces no second row", async () => {
    const client = new FakeFireflies([
      [transcript("ff-1")],
      [transcript("ff-1")],
    ]);
    const service = new CoachIntakeService(Database, client);

    await service.poll();
    const second = await service.poll();
    expect(second.observed).toBe(0);
    expect(second.alreadySeen).toBe(1);

    const rows = await conn
      .selectFrom("coach_intake_sessions")
      .select("source_session_id")
      .execute();
    expect(rows.length).toBe(1);
  });

  it("a genuinely new session in the overlap window is still picked up", async () => {
    const client = new FakeFireflies([
      [transcript("ff-1")],
      [transcript("ff-1"), transcript("ff-2")],
    ]);
    const service = new CoachIntakeService(Database, client);

    await service.poll();
    const second = await service.poll();
    expect(second.observed).toBe(1);
    expect(second.alreadySeen).toBe(1);

    const ids = (
      await conn
        .selectFrom("coach_intake_sessions")
        .select("source_session_id")
        .orderBy("source_session_id")
        .execute()
    ).map((r) => r.source_session_id);
    expect(ids).toEqual(["ff-1", "ff-2"]);
  });

  it("two sessions for one leader on one date are two sessions, not a duplicate", async () => {
    // Deduping on leader+date would delete exactly what task 2.4 exists to
    // preserve. There is one intake path now, so 'first path wins' is gone.
    const client = new FakeFireflies([
      [
        transcript("ff-morning", { dateString: "2026-08-22T14:00:00.000Z" }),
        transcript("ff-evening", { dateString: "2026-08-22T23:00:00.000Z" }),
      ],
    ]);
    const service = new CoachIntakeService(Database, client);

    const result = await service.poll();
    expect(result.observed).toBe(2);
    const rows = await conn
      .selectFrom("coach_intake_sessions")
      .select(["source_session_id", "session_date"])
      .execute();
    expect(rows.length).toBe(2);
  });

  it("a session it cannot attribute is INGESTED and flagged, never dropped", async () => {
    const client = new FakeFireflies([
      [transcript("ff-x", { title: "Some unrelated meeting" })],
    ]);
    const service = new CoachIntakeService(Database, client);

    const result = await service.poll();
    expect(result.observed).toBe(1);
    expect(result.unresolved).toBe(1);

    const row = await conn
      .selectFrom("coach_intake_sessions")
      .selectAll()
      .where("source_session_id", "=", "ff-x")
      .executeTakeFirstOrThrow();
    expect(row.coach_id).toBeNull();
    expect(row.matched_by).toBe("unresolved");
  });
});

describe("the poll reads the whole history, not the first page", () => {
  beforeEach(async () => {
    await clear();
    await seedLeader();
  });
  afterEach(clear);

  /** A client that hands back a full page until it runs out. */
  class PagingFireflies implements FirefliesClient {
    calls: Array<{ since: Date | null; skip: number }> = [];
    constructor(private readonly total: number) {}
    async listTranscripts(opts: {
      since: Date | null;
      limit: number;
      skip?: number;
    }): Promise<FirefliesTranscript[]> {
      const skip = opts.skip ?? 0;
      this.calls.push({ since: opts.since, skip });
      const remaining = Math.max(0, this.total - skip);
      return Array.from({ length: Math.min(opts.limit, remaining) }, (_, i) =>
        transcript(`ff-page-${skip + i}`),
      );
    }
  }

  it("pages until a short page comes back", async () => {
    // One 50-row request was all it ever made, with no truncation check, so on
    // the FIRST run, which asks for everything, any history past row 50 became
    // permanently unreachable: the next watermark is far narrower, and nothing
    // would ever ask for that range again.
    const client = new PagingFireflies(120);
    const result = await new CoachIntakeService(Database, client).poll();

    expect(result.observed).toBe(120);
    expect(client.calls.map((c) => c.skip)).toEqual([0, 50, 100]);
  });

  it("stops after ONE call when the first page is short", async () => {
    const client = new PagingFireflies(3);
    await new CoachIntakeService(Database, client).poll();
    expect(client.calls.length).toBe(1);
  });

  it("a session with an unparseable date is SKIPPED, not fatal to the batch", async () => {
    // It used to throw RangeError from inside the insert loop, so every session
    // after it went uninserted and the next tick hit the same record again.
    const client = new FakeFireflies([
      [
        transcript("ff-ok-1"),
        transcript("ff-bad", { dateString: "not a date at all" }),
        transcript("ff-ok-2"),
      ],
    ]);
    const result = await new CoachIntakeService(Database, client).poll();

    expect(result.observed).toBe(2);
    const ids = (
      await conn
        .selectFrom("coach_intake_sessions")
        .select("source_session_id")
        .orderBy("source_session_id")
        .execute()
    ).map((r) => r.source_session_id);
    expect(ids).toEqual(["ff-ok-1", "ff-ok-2"]);
  });

  it("the watermark uses the PROVIDER's clock, not our insertion time", async () => {
    // It was max(observed_at), our own timestamp, compared against fromDate,
    // which filters the provider's session date. A session recorded three weeks
    // ago but first observed today pushed the window to "now minus a week",
    // excluding its still-unobserved neighbours forever.
    const client = new FakeFireflies([
      [transcript("ff-old", { dateString: "2026-06-01T10:00:00.000Z" })],
      [],
    ]);
    const service = new CoachIntakeService(Database, client);
    await service.poll();

    const since = await service.watermark();
    expect(since).toBeInstanceOf(Date);
    // Anchored to the June session date, not to today.
    expect((since as Date).getUTCFullYear()).toBe(2026);
    expect((since as Date) < new Date("2026-06-02T00:00:00.000Z")).toBe(true);
  });

  it("the sender address is NOT persisted", async () => {
    const client = new FakeFireflies([[transcript("ff-1")]]);
    await new CoachIntakeService(Database, client).poll();
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("host_email")
      .where("source_session_id", "=", "ff-1")
      .executeTakeFirstOrThrow();
    expect(row.host_email).toBeNull();
  });

  it("a title carrying CRLF is stripped before it can reach a mail header", async () => {
    const client = new FakeFireflies([
      [transcript("ff-1", { title: "Obadiah\r\nBcc: someone@evil.test" })],
    ]);
    await new CoachIntakeService(Database, client).poll();
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("title")
      .where("source_session_id", "=", "ff-1")
      .executeTakeFirstOrThrow();
    expect(row.title).not.toMatch(/[\r\n]/);
    expect(row.title).toContain("Obadiah");
  });
});
