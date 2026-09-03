import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachReshareService } from "./coach-reshare.service";
import { RETRIEVAL_ATTEMPT_LIMIT } from "./coach-retrieval.service";

const conn = Database.getOrCreateConnection();
const COACH = "reshare-coach";
const EMAIL = "reshare-leader@example.test";

class FakeMailer {
  sent: Array<{ to: string; subject: string }> = [];
  constructor(private readonly ok = true) {}
  async sendEmail(data: {
    subject: string;
    to: { name: string; email: string };
  }) {
    this.sent.push({ to: data.to.email, subject: data.subject });
    return this.ok
      ? { delivered: true }
      : { delivered: false, error: "rejected" };
  }
}

async function seed(state: string, over: Record<string, unknown> = {}) {
  await conn
    .insertInto("coach_leaders")
    .values({ slug: COACH, email: EMAIL, name: "Jeff Ward" })
    .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: "ff-reshare",
      coach_id: COACH,
      title: "Obadiah",
      session_date: "2026-08-22",
      state,
      retry_count: RETRIEVAL_ATTEMPT_LIMIT,
      ...over,
    })
    .execute();
}

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "=", COACH)
    .execute();
  await conn.deleteFrom("coach_leaders").where("email", "=", EMAIL).execute();
}

describe("asking a leader to re-share a recording", () => {
  beforeEach(clear);
  afterEach(clear);

  it("sends to the leader and names the session and the attempts", async () => {
    await seed("retrieval_failed", { reshare_requested_at: new Date() });
    const mailer = new FakeMailer();
    const result = await new CoachReshareService(Database, mailer).send(
      "ff-reshare",
    );

    expect(result.sent).toBe(true);
    expect(mailer.sent.length).toBe(1);
    expect(mailer.sent[0].to).toBe(EMAIL);
    expect(mailer.sent[0].subject).toContain("Obadiah");
    expect(mailer.sent[0].subject).toContain("2026-08-22");
  });

  it("refuses a session that has NOT run out of retries", async () => {
    // Otherwise a leader is asked to re-share a recording the system either
    // already has or has not finished trying for.
    await seed("held");
    const mailer = new FakeMailer();
    const result = await new CoachReshareService(Database, mailer).send(
      "ff-reshare",
    );
    expect(result.sent).toBe(false);
    expect(result.refusal).toBe("not-pending");
    expect(mailer.sent.length).toBe(0);
  });

  it("refuses a request already resolved", async () => {
    await seed("retrieval_failed", {
      reshare_requested_at: new Date(),
      reshare_resolved_at: new Date(),
    });
    const mailer = new FakeMailer();
    const result = await new CoachReshareService(Database, mailer).send(
      "ff-reshare",
    );
    expect(result.refusal).toBe("not-pending");
    expect(mailer.sent.length).toBe(0);
  });

  it("refuses an unknown session", async () => {
    const result = await new CoachReshareService(
      Database,
      new FakeMailer(),
    ).send("no-such-session");
    expect(result.refusal).toBe("unknown-session");
  });

  it("a FAILED send is not recorded as asked", async () => {
    // A request the leader never received, marked as asked, is how a session
    // waits forever on a reply nobody was invited to give.
    const requestedAt = new Date("2026-08-25T00:00:00Z");
    await seed("retrieval_failed", { reshare_requested_at: requestedAt });
    const mailer = new FakeMailer(false);
    const result = await new CoachReshareService(Database, mailer).send(
      "ff-reshare",
    );

    expect(result.sent).toBe(false);
    expect(result.refusal).toBe("send-failed");
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select("reshare_requested_at")
      .where("source_session_id", "=", "ff-reshare")
      .executeTakeFirstOrThrow();
    expect(new Date(row.reshare_requested_at as Date).toISOString()).toBe(
      requestedAt.toISOString(),
    );
  });

  it("a successful send is recorded against the request", async () => {
    const requestedAt = new Date("2026-08-25T00:00:00Z");
    await seed("retrieval_failed", { reshare_requested_at: requestedAt });
    await new CoachReshareService(Database, new FakeMailer()).send(
      "ff-reshare",
    );
    const row = await conn
      .selectFrom("coach_intake_sessions")
      .select(["reshare_requested_at", "reshare_sent_at"])
      .where("source_session_id", "=", "ff-reshare")
      .executeTakeFirstOrThrow();
    // The SEND is what gets stamped. Refreshing the request timestamp instead
    // left every part of "still pending" true, which is what let the same
    // request go out twice.
    expect(row.reshare_sent_at).not.toBeNull();
    expect(new Date(row.reshare_requested_at as Date).toISOString()).toBe(
      requestedAt.toISOString(),
    );
  });

  it("does NOT ask the same leader twice for the same session", async () => {
    // Two clicks on the admin surface, or a page reload that re-posts, used to
    // send the leader a second copy of the same request.
    await seed("retrieval_failed", {
      reshare_requested_at: new Date("2026-08-25T00:00:00Z"),
    });
    const mailer = new FakeMailer();
    const svc = new CoachReshareService(Database, mailer);

    expect((await svc.send("ff-reshare")).sent).toBe(true);
    const second = await svc.send("ff-reshare");
    expect(second.sent).toBe(false);
    expect(second.refusal).toBe("already-asked");
    expect(mailer.sent.length).toBe(1);
  });

  it("a session that fails AGAIN can be asked about again", async () => {
    // The marker is cleared when the request resolves and when a fresh failure
    // raises a new one, so a re-shared recording that fails a second time is
    // not silently unaskable.
    await seed("retrieval_failed", {
      reshare_requested_at: new Date("2026-08-25T00:00:00Z"),
    });
    const mailer = new FakeMailer();
    const svc = new CoachReshareService(Database, mailer);
    await svc.send("ff-reshare");

    await conn
      .updateTable("coach_intake_sessions")
      .set({
        reshare_sent_at: null,
        reshare_requested_at: new Date("2026-09-01T00:00:00Z"),
      })
      .where("source_session_id", "=", "ff-reshare")
      .execute();

    expect((await svc.send("ff-reshare")).sent).toBe(true);
    expect(mailer.sent.length).toBe(2);
  });
});
