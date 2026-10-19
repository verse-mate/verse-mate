import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import {
  CoachMondayReminderService,
  coachMondayRepeat,
} from "./coach-monday-reminder.service";
import { saveRotatingClass, setRotatingOnly } from "./coach-rotating.service";

const conn = Database.getOrCreateConnection();
const MONDAY_3PM = new Date("2031-03-10T20:00:00Z");
const SLUGS = ["mr-ana", "mr-ben", "mr-cy", "mr-dee", "mr-eve", "mr-fay"];
const GROUP = "mr-group@example.test";
const EMAIL = (slug: string) => `${slug}@example.test`;

class Mailer {
  sent: Array<{ to: string; subject: string; html: string }> = [];
  constructor(private readonly reject: (to: string) => boolean = () => false) {}
  async sendEmail(data: {
    to: { email: string };
    subject: string;
    html?: string;
  }) {
    this.sent.push({
      to: data.to.email,
      subject: data.subject,
      html: data.html ?? "",
    });
    return this.reject(data.to.email)
      ? { delivered: false, error: "rejected" }
      : { delivered: true };
  }
  to(email: string) {
    return this.sent.filter((s) => s.to === email);
  }
}

async function clear() {
  await conn
    .deleteFrom("coach_monday_reminders")
    .where("run_date", ">=", sql<Date>`'2031-01-01'::date`)
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", "mr-%")
    .execute();
  await conn
    .deleteFrom("coach_rotating_classes")
    .where("group_email", "=", GROUP)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", SLUGS).execute();
}

async function session(
  id: string,
  coachId: string | null,
  observedAt: string,
  over: Record<string, unknown> = {},
) {
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: id,
      coach_id: coachId,
      matched_by: "title_match",
      title: "Session",
      session_date: observedAt.slice(0, 10),
      observed_at: observedAt,
      ...over,
    })
    .execute();
}

function run(mailer = new Mailer(), now = MONDAY_3PM) {
  return new CoachMondayReminderService(
    Database,
    mailer as never,
    () => now,
  ).run();
}

async function records() {
  return conn
    .selectFrom("coach_monday_reminders")
    .select([
      "kind",
      "coach_id",
      "rotating_class_id",
      "found",
      "outcome",
      "reason",
    ])
    .where("run_date", "=", sql<Date>`'2031-03-10'::date`)
    .orderBy("kind")
    .orderBy("coach_id")
    .execute();
}

beforeEach(async () => {
  process.env[COACH_PIPELINE_LIVE] = "true";
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values(
      SLUGS.map((slug) => ({
        slug,
        email: EMAIL(slug),
        name: slug.replace("mr-", "Leader "),
      })),
    )
    .execute();
});
afterEach(async () => {
  delete process.env[COACH_PIPELINE_LIVE];
  await clear();
});

const ours = (r: { coach_id: string | null }) =>
  r.coach_id === null || SLUGS.includes(r.coach_id);

describe("Leaders Without A Session In The Past Week Are Reminded To Upload (task 6.17)", () => {
  it("A leader with no session this week: that leader alone gets a reminder with the upload page's link", async () => {
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ana"))).toHaveLength(1);
    expect(mailer.to(EMAIL("mr-ana"))[0].html).toContain("/coach/upload");
    expect(
      (await records()).find((r) => r.coach_id === "mr-ana"),
    ).toMatchObject({
      kind: "leader",
      found: false,
      outcome: "sent",
    });
  });

  it("A leader who uploaded this week is not reminded, and the run records a session was found", async () => {
    await session("mr-upload-1", "mr-ana", "2031-03-08T16:00:00Z", {
      source: "upload",
    });
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ana"))).toEqual([]);
    expect(
      (await records()).find((r) => r.coach_id === "mr-ana"),
    ).toMatchObject({
      found: true,
      outcome: "not-needed",
    });
  });

  it("On Monday a leader uploads a session dated nine days earlier: it arrived in the window, so no reminder", async () => {
    await session("mr-upload-late", "mr-ben", "2031-03-10T14:00:00Z", {
      source: "upload",
      session_date: "2031-03-01",
    });
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ben"))).toEqual([]);
  });

  it("the window runs from the start of the day eight days before through the end of the run's day, Chicago time", async () => {
    await session("mr-edge-in", "mr-ana", "2031-03-02T06:30:00Z");
    await session("mr-edge-out", "mr-ben", "2031-03-02T05:30:00Z");
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ana"))).toEqual([]);
    expect(mailer.to(EMAIL("mr-ben"))).toHaveLength(1);
  });

  it("A rotating class taught by one of its leaders reminds no one on its account, and nothing goes to the group address", async () => {
    const klass = await saveRotatingClass(Database, {
      name: "Harbor",
      groupEmail: GROUP,
      titleMatch: [],
      leaders: ["mr-ana", "mr-ben"],
    });
    if (!klass.ok) throw new Error("not saved");
    await setRotatingOnly(Database, "mr-ben", true);
    await session("mr-rot-1", "mr-ana", "2031-03-07T01:00:00Z", {
      rotating_class_id: klass.id,
    });
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ben"))).toEqual([]);
    expect(mailer.to(GROUP)).toEqual([]);
    expect(
      (await records()).find(
        (r) => r.kind === "class" && r.rotating_class_id === klass.id,
      ),
    ).toMatchObject({ found: true, outcome: "not-needed" });
  });

  it("A rotating class with no session: each leader with an address of their own is reminded, a leader without one is skipped, nothing goes to the group", async () => {
    const klass = await saveRotatingClass(Database, {
      name: "Harbor",
      groupEmail: GROUP,
      titleMatch: [],
      leaders: ["mr-cy", "mr-dee"],
    });
    if (!klass.ok) throw new Error("not saved");
    await conn
      .updateTable("coach_leaders")
      .set({ email: "mr-dee@needs-real-email.invalid" })
      .where("slug", "=", "mr-dee")
      .execute();
    await setRotatingOnly(Database, "mr-cy", true);
    await setRotatingOnly(Database, "mr-dee", true);
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-cy"))).toHaveLength(1);
    expect(mailer.sent.some((s) => s.to.includes("mr-dee"))).toBe(false);
    expect(mailer.to(GROUP)).toEqual([]);
    expect(
      (await records()).find((r) => r.coach_id === "mr-dee"),
    ).toMatchObject({
      outcome: "skipped",
    });
  });

  it("A leader who teaches only in a rotating class is checked only through it; another leader's own check still runs", async () => {
    const klass = await saveRotatingClass(Database, {
      name: "Harbor",
      groupEmail: GROUP,
      titleMatch: [],
      leaders: ["mr-ana", "mr-ben", "mr-cy"],
    });
    if (!klass.ok) throw new Error("not saved");
    await setRotatingOnly(Database, "mr-ben", true);
    await session("mr-rot-2", "mr-ana", "2031-03-07T01:00:00Z", {
      rotating_class_id: klass.id,
    });
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ben"))).toEqual([]);
    expect(mailer.to(EMAIL("mr-cy"))).toHaveLength(1);
    expect(
      (await records()).find((r) => r.coach_id === "mr-ben"),
    ).toMatchObject({
      outcome: "checked-by-class",
    });
  });

  it("Two checks reach one address: one reminder per address per run, for a leader reached through a quiet rotating class and on their own", async () => {
    const klass = await saveRotatingClass(Database, {
      name: "Harbor",
      groupEmail: GROUP,
      titleMatch: [],
      leaders: ["mr-eve", "mr-fay"],
    });
    if (!klass.ok) throw new Error("not saved");
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-eve"))).toHaveLength(1);
    expect(mailer.to(EMAIL("mr-fay"))).toHaveLength(1);
  });

  it("A leader attested not teaching is not reminded, and is recorded as skipped", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ not_teaching_attested_at: "2031-03-01T00:00:00Z" })
      .where("slug", "=", "mr-ana")
      .execute();
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ana"))).toEqual([]);
    expect(
      (await records()).find((r) => r.coach_id === "mr-ana"),
    ).toMatchObject({
      outcome: "skipped",
      reason: "attested not teaching",
    });
  });

  it("an attestation older than eight weeks no longer stops the reminder", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ not_teaching_attested_at: "2030-12-01T00:00:00Z" })
      .where("slug", "=", "mr-ana")
      .execute();
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ana"))).toHaveLength(1);
  });

  it("A Monday reminder fails to send: the others still go out, and the run records the failure", async () => {
    const mailer = new Mailer((to) => to === EMAIL("mr-ana"));
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ben"))).toHaveLength(1);
    expect(
      (await records()).find((r) => r.coach_id === "mr-ana"),
    ).toMatchObject({
      outcome: "failed",
    });
  });

  it("the owners are never copied, a second run on the same Monday sends nothing twice, and the parallel run sends nothing", async () => {
    const mailer = new Mailer();
    await run(mailer);
    const first = mailer.sent.length;
    await run(mailer);
    expect(mailer.sent.length).toBe(first);
    const owners = (
      await conn.selectFrom("coach_admins").select("email").execute()
    ).map((a) => a.email);
    expect(mailer.sent.some((s) => owners.includes(s.to))).toBe(false);
    delete process.env[COACH_PIPELINE_LIVE];
    const quiet = new Mailer();
    const result = await run(quiet, new Date("2031-03-17T20:00:00Z"));
    expect(result.skipped).toBe("parallel-run");
    expect(quiet.sent).toEqual([]);
  });

  it("runs every Monday at 15:00 America/Chicago", () => {
    expect(coachMondayRepeat()).toEqual({
      pattern: "0 15 * * 1",
      tz: "America/Chicago",
    });
  });

  it("records only for leaders the roster lists", async () => {
    await run(new Mailer());
    expect((await records()).filter(ours).length).toBe(SLUGS.length);
  });
});

describe("review fixes: the Monday reminder", () => {
  it("a rotating class's leader who held a session of their own that week is not reminded on the quiet class's account", async () => {
    const klass = await saveRotatingClass(Database, {
      name: "Harbor",
      groupEmail: GROUP,
      titleMatch: [],
      leaders: ["mr-ana", "mr-ben"],
    });
    if (!klass.ok) throw new Error("not saved");
    await session("mr-own-1", "mr-ana", "2031-03-07T01:00:00Z");
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(EMAIL("mr-ana"))).toEqual([]);
    expect(mailer.to(EMAIL("mr-ben"))).toHaveLength(1);
  });

  it("a run stopped after some sends does not send those again when it is retried", async () => {
    let calls = 0;
    const crashing = new Mailer();
    const original = crashing.sendEmail.bind(crashing);
    crashing.sendEmail = async (data) => {
      calls += 1;
      if (calls === 3)
        throw {
          toString(): string {
            throw new Error("worker stopped");
          },
        };
      return original(data);
    };
    await run(crashing).catch(() => {});
    const retry = new Mailer();
    await run(retry);
    const firstTwo = crashing.sent.map((s) => s.to);
    expect(firstTwo).toHaveLength(2);
    for (const to of firstTwo) expect(retry.to(to)).toEqual([]);
  });

  it("a leader whose own address is a class's group address is skipped and recorded", async () => {
    const klass = await saveRotatingClass(Database, {
      name: "Harbor",
      groupEmail: GROUP,
      titleMatch: [],
      leaders: ["mr-cy"],
    });
    if (!klass.ok) throw new Error("not saved");
    await conn
      .updateTable("coach_leaders")
      .set({ email: GROUP })
      .where("slug", "=", "mr-dee")
      .execute();
    const mailer = new Mailer();
    await run(mailer);
    expect(mailer.to(GROUP)).toEqual([]);
    expect(
      (await records()).find((r) => r.coach_id === "mr-dee"),
    ).toMatchObject({
      outcome: "skipped",
      reason: "no address of their own, only the class's group address",
    });
  });
});
