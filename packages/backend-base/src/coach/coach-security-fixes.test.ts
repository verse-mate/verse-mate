import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { isAllowedVideoUrl } from "./coach-archive.service";
import {
  CoachRetrievalService,
  SWEEP_BATCH_LIMIT,
} from "./coach-retrieval.service";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
const COACH = "secfix-coach";
const ADMIN = "secfix-admin@example.test";

describe("the provider's video URL is not trusted", () => {
  const ORIGINAL = process.env.COACH_VIDEO_HOST_ALLOWLIST;
  afterEach(() => {
    if (ORIGINAL === undefined)
      Reflect.deleteProperty(process.env, "COACH_VIDEO_HOST_ALLOWLIST");
    else process.env.COACH_VIDEO_HOST_ALLOWLIST = ORIGINAL;
  });

  it("accepts the provider's own hosts", () => {
    expect(isAllowedVideoUrl("https://cdn.fireflies.ai/rec/abc.mp4")).toBe(
      true,
    );
    expect(isAllowedVideoUrl("https://fireflies.ai/rec/abc.mp4")).toBe(true);
  });

  it("refuses cloud instance metadata OVER HTTPS", () => {
    // The SSRF that mattered: the response was streamed straight into our
    // bucket, so this was a read primitive with a write sink.
    //
    // Deliberately https, so only the HOST half of the guard can reject it.
    // Written as http it was refused by the scheme check alone, and deleting
    // the allowlist entirely would have left this test green.
    expect(
      isAllowedVideoUrl(
        "https://169.254.169.254/latest/meta-data/iam/security-credentials/",
      ),
    ).toBe(false);
    expect(isAllowedVideoUrl("https://internal.svc.cluster.local/x")).toBe(
      false,
    );
  });

  it("is not fooled by userinfo naming an allowed host", () => {
    // The authority is what gets connected to, not the part before the @.
    expect(
      isAllowedVideoUrl("https://fireflies.ai@169.254.169.254/meta-data"),
    ).toBe(false);
  });

  it("refuses plain http even on an allowed host", () => {
    expect(isAllowedVideoUrl("http://cdn.fireflies.ai/rec/abc.mp4")).toBe(
      false,
    );
  });

  it("refuses a host that merely CONTAINS an allowed one", () => {
    // Suffix matching must be on a dot boundary, or an attacker registers
    // fireflies.ai.evil.test and is allowed.
    expect(isAllowedVideoUrl("https://fireflies.ai.evil.test/x.mp4")).toBe(
      false,
    );
    expect(isAllowedVideoUrl("https://notfireflies.ai/x.mp4")).toBe(false);
  });

  it("refuses garbage rather than throwing", () => {
    expect(isAllowedVideoUrl("not a url")).toBe(false);
    expect(isAllowedVideoUrl("")).toBe(false);
  });

  it("is configurable, so a CDN move is not a deploy", () => {
    process.env.COACH_VIDEO_HOST_ALLOWLIST = "newcdn.example";
    expect(isAllowedVideoUrl("https://newcdn.example/x.mp4")).toBe(true);
    expect(isAllowedVideoUrl("https://cdn.fireflies.ai/x.mp4")).toBe(false);
  });
});

describe("one broken session does not starve the queue", () => {
  async function seed(id: string) {
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: id,
        coach_id: COACH,
        title: "s",
        session_date: "2026-08-22",
        state: "observed",
      })
      .execute();
  }
  async function clear() {
    await conn
      .deleteFrom("coach_intake_sessions")
      .where("coach_id", "=", COACH)
      .execute();
  }
  beforeEach(clear);
  afterEach(clear);

  it("a THROWN error counts as a failed attempt and the sweep continues", async () => {
    // Before: an uncaught throw aborted the tick BEFORE incrementing
    // retry_count, so the oldest broken session never reached the attempt
    // limit, never entered retrieval_failed, and never raised a re-share
    // request, while everything behind it waited forever.
    await seed("ff-throws");
    await seed("ff-fine");
    const archive = {
      calls: [] as string[],
      async retain(id: string) {
        this.calls.push(id);
        if (id === "ff-throws") throw new Error("provider exploded");
        await conn
          .updateTable("coach_intake_sessions")
          .set({ state: "retained" })
          .where("source_session_id", "=", id)
          .execute();
        return { retained: true };
      },
    };
    const result = await new CoachRetrievalService(
      Database,
      archive as any,
    ).sweep();

    expect(archive.calls).toEqual(["ff-throws", "ff-fine"]);
    expect(result.retained).toBe(1);
    const broken = await conn
      .selectFrom("coach_intake_sessions")
      .select(["retry_count", "state"])
      .where("source_session_id", "=", "ff-throws")
      .executeTakeFirstOrThrow();
    expect(broken.retry_count).toBe(1);
    expect(broken.state).toBe("held");
  });

  it("one tick has a bounded budget", async () => {
    for (let i = 0; i < SWEEP_BATCH_LIMIT + 5; i += 1) await seed(`ff-${i}`);
    const archive = {
      n: 0,
      async retain() {
        this.n += 1;
        return { retained: false, reason: "retrieval-failed" as const };
      },
    };
    await new CoachRetrievalService(Database, archive as any).sweep();
    expect(archive.n).toBe(SWEEP_BATCH_LIMIT);
  });
});

describe("admin authority is data, and revoking it takes effect", () => {
  async function clear() {
    await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
    await conn.deleteFrom("user").where("email", "=", ADMIN).execute();
  }
  beforeEach(clear);
  afterEach(clear);

  it("a row in coach_admins grants the role, and DELETE revokes it", async () => {
    // Before: isAdmin read the compiled-in bundle, so the table was
    // decorative, DELETE FROM coach_admins silently did nothing and revoking
    // the highest privilege in the system needed a deploy.
    const user = await conn
      .insertInto("user")
      .values({ email: ADMIN, firstName: "Sec", lastName: "Fix" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const service = new CoachService(Database);

    await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
    expect(await service.isAdmin(user.id)).toBe(true);

    await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
    expect(await service.isAdmin(user.id)).toBe(false);
  });

  it("a non-admin is refused while the table is populated", async () => {
    const user = await conn
      .insertInto("user")
      .values({ email: ADMIN, firstName: "Sec", lastName: "Fix" })
      .returning("id")
      .executeTakeFirstOrThrow();
    // The seeded program admin keeps the table non-empty.
    expect(await new CoachService(Database).isAdmin(user.id)).toBe(false);
  });
});
