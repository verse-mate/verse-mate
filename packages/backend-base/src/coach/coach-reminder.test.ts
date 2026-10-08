import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";
import { sql } from "kysely";

import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import {
  COACH_REMINDER_DEFAULT_CRON,
  COACH_REMINDER_QUEUE,
} from "./coach-reminder.queue";
import {
  CoachReminderService,
  calendarDate,
  reminderItems,
} from "./coach-reminder.service";
import {
  COACH_REMINDER_WORKER_OPTIONS,
  coachReminderRepeat,
} from "./coach-reminder.worker";

const conn = Database.getOrCreateConnection();
const ADMIN = "remind-admin@example.test";
const LEADERS = {
  thursday: "remind-thursday",
  twoClasses: "remind-two-classes",
  quiet: "remind-quiet",
  placeholder: "remind-placeholder",
  empty: "remind-empty",
};
const emailOf = (slug: string) =>
  slug === LEADERS.placeholder
    ? "remind-placeholder@needs-real-email.invalid"
    : `${slug}@example.test`;

const WEDNESDAY_6PM = new Date("2026-09-30T23:00:00Z");
const THURSDAY_6PM = new Date("2026-10-01T23:00:00Z");
const FRIDAY_6PM = new Date("2026-10-02T23:00:00Z");
const MONDAY_6PM = new Date("2026-09-28T23:00:00Z");

function prose(prefix: string) {
  return Array.from({ length: 5 }, (_, i) => ({
    title: `${prefix} ${i + 1}`,
    paragraphs: [
      `"A quote said in the room."`,
      `Why ${prefix.toLowerCase()} ${i + 1} matters. More detail follows here.`,
    ],
  }));
}

function legacyBody(tag: string) {
  return {
    bigIdeas: [],
    feedback: {
      headline: tag,
      strengths: ["three", "short", "titles"],
      recommendations: ["three", "short", "titles"],
      strengthsProse: prose(`${tag} strength`),
      recommendationsProse: prose(`${tag} recommendation`),
    },
  };
}

class FakeMailer {
  sent: Array<{ to: string; subject: string; text: string; html?: string }> =
    [];
  constructor(private readonly reject: (to: string) => boolean = () => false) {}
  async sendEmail(data: {
    subject: string;
    to: { email: string };
    text: string;
    html?: string;
  }) {
    this.sent.push({
      to: data.to.email,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });
    return this.reject(data.to.email)
      ? { delivered: false, error: "rejected" }
      : { delivered: true };
  }
  to(email: string) {
    return this.sent.filter((s) => s.to === email);
  }
}

async function report(
  coachId: string,
  date: string,
  options: { body?: unknown; pipelineState?: string; held?: boolean } = {},
) {
  const id = `${coachId}-${date}`;
  const pipeline = options.pipelineState !== undefined;
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: coachId,
      session_date: date,
      source_session_id: pipeline ? `ff-${id}` : `legacy:${coachId}:${date}`,
      legacy_ids: [],
      summary: {},
      metrics: {},
      body: JSON.stringify(options.body ?? legacyBody(date)),
      held: options.held ?? false,
    })
    .execute();
  if (!pipeline) return;
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: `ff-${id}`,
      coach_id: coachId,
      title: "t",
      session_date: date,
      state: options.pipelineState as string,
      report_id: id,
    })
    .execute();
}

async function clear() {
  const slugs = Object.values(LEADERS);
  await conn
    .deleteFrom("coach_reminder_sends")
    .where("coach_id", "in", slugs)
    .execute();
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "in", slugs)
    .execute();
  await conn
    .deleteFrom("coach_reports")
    .where("coach_id", "in", slugs)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", slugs).execute();
  await conn.deleteFrom("coach_admins").where("email", "=", ADMIN).execute();
  await conn
    .deleteFrom("coach_reminder_summaries")
    .where("reminder_date", ">=", sql<Date>`'2026-09-01'::date`)
    .where("reminder_date", "<=", sql<Date>`'2026-10-31'::date`)
    .execute();
}

async function seedRoster() {
  await conn
    .insertInto("coach_leaders")
    .values(
      Object.values(LEADERS).map((slug) => ({
        slug,
        email: emailOf(slug),
        name: slug,
      })),
    )
    .execute();
  await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
}

function run(mailer: FakeMailer, now: Date) {
  return new CoachReminderService(Database, mailer, () => now).run();
}

const reminders = (mailer: FakeMailer) =>
  mailer.sent.filter((s) => s.subject.startsWith("Coaching reminder for"));

describe("leaders get a reminder before each class", () => {
  beforeEach(async () => {
    process.env[COACH_PIPELINE_LIVE] = "true";
    await clear();
    await seedRoster();
  });
  afterEach(async () => {
    delete process.env[COACH_PIPELINE_LIVE];
    await clear();
  });

  it("A leader's class is tomorrow: the leader alone gets that report's five strengths and five recommendations", async () => {
    await report(LEADERS.thursday, "2026-09-17");
    await report(LEADERS.thursday, "2026-09-20");
    const mailer = new FakeMailer();
    const result = await run(mailer, WEDNESDAY_6PM);

    const [mail] = mailer.to(emailOf(LEADERS.thursday));
    expect(mail.subject).toBe("Coaching reminder for Thursday's class");
    for (let i = 1; i <= 5; i += 1) {
      expect(mail.html).toContain(`2026-09-20 strength ${i}`);
      expect(mail.html).toContain(`2026-09-20 recommendation ${i}`);
      expect(mail.text).toContain(`${i}. 2026-09-20 strength ${i}`);
    }
    expect(mail.html).not.toContain("2026-09-17");
    expect(mail.html).not.toContain("A quote said in the room");
    expect(
      reminders(mailer).filter((m) => m.to === emailOf(LEADERS.thursday)),
    ).toHaveLength(1);
    expect(reminders(mailer).some((m) => m.to === ADMIN)).toBe(false);
    expect(result.sent).toContainEqual({
      coachId: LEADERS.thursday,
      email: emailOf(LEADERS.thursday),
      reportId: `${LEADERS.thursday}-2026-09-20`,
    });
    expect(mailer.to(ADMIN)).toHaveLength(1);
  });

  it("the reminder carries the latest DELIVERED report, never a held one", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await report(LEADERS.thursday, "2026-09-27", {
      pipelineState: "scored",
      body: legacyBody("held"),
    });
    const mailer = new FakeMailer();
    await run(mailer, WEDNESDAY_6PM);
    const [mail] = mailer.to(emailOf(LEADERS.thursday));
    expect(mail.html).toContain("2026-09-24 strength 1");
    expect(mail.html).not.toContain("held strength");
  });

  it("A leader has gone quiet: no reminder when the latest report is over 14 days old", async () => {
    await report(LEADERS.quiet, "2026-09-10");
    const mailer = new FakeMailer();
    const result = await run(mailer, WEDNESDAY_6PM);
    expect(mailer.to(emailOf(LEADERS.quiet))).toEqual([]);
    expect(result.notReminded.map((n) => n.coachId)).toContain(LEADERS.quiet);
  });

  it("A leader teaches two classes: reminded on Wednesday and on Friday", async () => {
    await report(LEADERS.twoClasses, "2026-09-24");
    await report(LEADERS.twoClasses, "2026-09-26");
    const address = emailOf(LEADERS.twoClasses);

    const wednesday = new FakeMailer();
    await run(wednesday, WEDNESDAY_6PM);
    expect(wednesday.to(address).map((m) => m.subject)).toEqual([
      "Coaching reminder for Thursday's class",
    ]);

    const thursday = new FakeMailer();
    await run(thursday, THURSDAY_6PM);
    expect(thursday.to(address)).toEqual([]);

    const friday = new FakeMailer();
    await run(friday, FRIDAY_6PM);
    expect(friday.to(address).map((m) => m.subject)).toEqual([
      "Coaching reminder for Saturday's class",
    ]);
  });

  it("Nothing to send today: no reminder and no admin summary", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await report(LEADERS.twoClasses, "2026-09-26");
    const mailer = new FakeMailer();
    const result = await run(mailer, MONDAY_6PM);
    expect(mailer.sent).toEqual([]);
    expect(result.summarySent).toBe(false);
  });

  it("A reminder fails to send: the others still go out and the admin summary names the failure", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await report(LEADERS.twoClasses, "2026-09-24");
    const mailer = new FakeMailer((to) => to === emailOf(LEADERS.thursday));
    const result = await run(mailer, WEDNESDAY_6PM);

    expect(mailer.to(emailOf(LEADERS.twoClasses))).toHaveLength(1);
    expect(result.failed).toContainEqual({
      coachId: LEADERS.thursday,
      reason: "rejected by the mail service: rejected",
    });
    const [summary] = mailer.to(ADMIN);
    expect(summary.subject).toContain("failed");
    expect(summary.text).toContain(`Failed: ${LEADERS.thursday}`);
    expect(summary.text).toContain(`Sent: ${LEADERS.twoClasses}`);
    expect(result.summarySent).toBe(true);
  });

  it("one leader throwing does not stop the others", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await report(LEADERS.twoClasses, "2026-09-24");
    const mailer = new FakeMailer();
    const original = mailer.sendEmail.bind(mailer);
    mailer.sendEmail = async (data) => {
      if (data.to.email === emailOf(LEADERS.thursday))
        throw new Error("mail service down");
      return original(data);
    };
    const result = await run(mailer, WEDNESDAY_6PM);
    expect(mailer.to(emailOf(LEADERS.twoClasses))).toHaveLength(1);
    expect(result.failed).toContainEqual({
      coachId: LEADERS.thursday,
      reason: "mail service down",
    });
  });

  it("a placeholder address is skipped and reported to the admin", async () => {
    await report(LEADERS.placeholder, "2026-09-24");
    const mailer = new FakeMailer();
    const result = await run(mailer, WEDNESDAY_6PM);
    expect(mailer.to(emailOf(LEADERS.placeholder))).toEqual([]);
    expect(result.failed.map((f) => f.coachId)).toContain(LEADERS.placeholder);
    expect(mailer.to(ADMIN)[0].text).toContain(
      "remind-placeholder@needs-real-email.invalid",
    );
  });

  it("a latest report with no strengths or recommendations gets no reminder rather than an empty one", async () => {
    await report(LEADERS.empty, "2026-09-24", {
      pipelineState: "delivered",
      body: {
        bigIdeas: [],
        feedback: {
          headline: "",
          strengths: [],
          improvements: [],
          recommendations: [],
        },
      },
    });
    const mailer = new FakeMailer();
    const result = await run(mailer, WEDNESDAY_6PM);
    expect(mailer.to(emailOf(LEADERS.empty))).toEqual([]);
    expect(result.notReminded.map((n) => n.coachId)).toContain(LEADERS.empty);
  });

  it("in standard time 18:00 Central is the next UTC day, and the class reminded is still Central tomorrow's", async () => {
    await report(LEADERS.thursday, "2026-11-25");
    const mailer = new FakeMailer();
    const result = await run(mailer, new Date("2026-12-02T00:00:00Z"));
    expect(result.date).toBe("2026-12-01");
    expect(mailer.to(emailOf(LEADERS.thursday)).map((m) => m.subject)).toEqual([
      "Coaching reminder for Wednesday's class",
    ]);
  });

  it("a class day counts only from reports in the last 28 days", async () => {
    await report(LEADERS.thursday, "2026-08-27");
    await report(LEADERS.thursday, "2026-09-26");
    await report(LEADERS.twoClasses, "2026-09-03");
    await report(LEADERS.twoClasses, "2026-09-26");
    const mailer = new FakeMailer();
    await run(mailer, WEDNESDAY_6PM);
    expect(mailer.to(emailOf(LEADERS.thursday))).toEqual([]);
    expect(
      mailer.to(emailOf(LEADERS.twoClasses)).map((m) => m.subject),
    ).toEqual(["Coaching reminder for Thursday's class"]);
  });

  it("a latest report exactly 14 days old still reminds, one 15 days old does not", async () => {
    await report(LEADERS.thursday, "2026-09-10");
    await report(LEADERS.thursday, "2026-09-16");
    await report(LEADERS.quiet, "2026-09-10");
    await report(LEADERS.quiet, "2026-09-15");
    const mailer = new FakeMailer();
    const result = await run(mailer, WEDNESDAY_6PM);
    expect(mailer.to(emailOf(LEADERS.thursday))[0].html).toContain(
      "2026-09-16 strength 1",
    );
    expect(mailer.to(emailOf(LEADERS.quiet))).toEqual([]);
    expect(result.notReminded).toContainEqual({
      coachId: LEADERS.quiet,
      reason: "latest report 2026-09-15 is over 14 days old",
    });
  });

  it("a day on which every leader was skipped sends the admin no summary", async () => {
    await report(LEADERS.quiet, "2026-09-10");
    const mailer = new FakeMailer();
    const result = await run(mailer, WEDNESDAY_6PM);
    expect(result.notReminded.map((n) => n.coachId)).toEqual([LEADERS.quiet]);
    expect(mailer.sent).toEqual([]);
    expect(result.summarySent).toBe(false);
  });

  it("the summary skips an admin on a placeholder address and still reaches the others", async () => {
    const placeholderAdmin = "remind-admin@needs-real-email.invalid";
    await conn
      .insertInto("coach_admins")
      .values({ email: placeholderAdmin })
      .execute();
    try {
      await report(LEADERS.thursday, "2026-09-24");
      const mailer = new FakeMailer();
      const result = await run(mailer, WEDNESDAY_6PM);
      expect(mailer.to(placeholderAdmin)).toEqual([]);
      expect(mailer.to(ADMIN)).toHaveLength(1);
      expect(result.summarySent).toBe(true);
    } finally {
      await conn
        .deleteFrom("coach_admins")
        .where("email", "=", placeholderAdmin)
        .execute();
    }
  });

  it("a delivered report held from its leader is never the one reminded", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await report(LEADERS.thursday, "2026-09-27", {
      pipelineState: "delivered",
      body: legacyBody("held"),
      held: true,
    });
    const mailer = new FakeMailer();
    await run(mailer, WEDNESDAY_6PM);
    const [mail] = mailer.to(emailOf(LEADERS.thursday));
    expect(mail.html).toContain("2026-09-24 strength 1");
    expect(mail.html).not.toContain("held strength");
  });

  it("a re-run on the same Central date sends only what the first run did not", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await report(LEADERS.twoClasses, "2026-09-24");
    const first = new FakeMailer((to) => to === emailOf(LEADERS.thursday));
    await run(first, WEDNESDAY_6PM);
    expect(first.to(emailOf(LEADERS.twoClasses))).toHaveLength(1);

    const again = new FakeMailer();
    const result = await run(again, new Date("2026-10-01T01:00:00Z"));
    expect(result.date).toBe("2026-09-30");
    expect(again.to(emailOf(LEADERS.twoClasses))).toEqual([]);
    expect(again.to(emailOf(LEADERS.thursday))).toHaveLength(1);
    expect(result.sent.map((s) => s.coachId)).toEqual([LEADERS.thursday]);

    const third = new FakeMailer();
    const quiet = await run(third, WEDNESDAY_6PM);
    expect(third.sent).toEqual([]);
    expect(quiet.summarySent).toBe(false);
  });

  it("two overlapping runs on the same Central date mail each leader once", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await report(LEADERS.twoClasses, "2026-09-24");
    const second = new FakeMailer();
    let overlapped: Promise<unknown> | null = null;
    const first = new FakeMailer();
    const send = first.sendEmail.bind(first);
    first.sendEmail = async (data) => {
      if (!overlapped) {
        overlapped = run(second, WEDNESDAY_6PM);
        await overlapped;
      }
      return send(data);
    };
    await run(first, WEDNESDAY_6PM);
    for (const leader of [LEADERS.thursday, LEADERS.twoClasses])
      expect([
        ...first.to(emailOf(leader)),
        ...second.to(emailOf(leader)),
      ]).toHaveLength(1);
  });

  it("a send that throws leaves the leader for the next run on the same date", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    const failing = new FakeMailer();
    failing.sendEmail = async () => {
      throw new Error("mail service down");
    };
    await run(failing, WEDNESDAY_6PM);
    const again = new FakeMailer();
    await run(again, WEDNESDAY_6PM);
    expect(again.to(emailOf(LEADERS.thursday))).toHaveLength(1);
  });

  it("a re-run whose only news is the same placeholder failure sends the admin no second summary", async () => {
    await report(LEADERS.placeholder, "2026-09-24");
    const first = new FakeMailer();
    expect((await run(first, WEDNESDAY_6PM)).summarySent).toBe(true);
    const again = new FakeMailer();
    const result = await run(again, WEDNESDAY_6PM);
    expect(result.failed.map((f) => f.coachId)).toContain(LEADERS.placeholder);
    expect(again.to(ADMIN)).toEqual([]);
    expect(result.summarySent).toBe(false);
  });

  it("a re-run that sends a reminder the first run could not tells the admin about it", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    await run(
      new FakeMailer((to) => to === emailOf(LEADERS.thursday)),
      WEDNESDAY_6PM,
    );
    const again = new FakeMailer();
    await run(again, WEDNESDAY_6PM);
    expect(again.to(ADMIN)[0]?.text).toContain(`Sent: ${LEADERS.thursday}`);
  });

  it("before cutover nothing is sent", async () => {
    await report(LEADERS.thursday, "2026-09-24");
    delete process.env[COACH_PIPELINE_LIVE];
    const mailer = new FakeMailer();
    const result = await run(mailer, WEDNESDAY_6PM);
    expect(result.skipped).toBe("parallel-run");
    expect(mailer.sent).toEqual([]);
  });
});

describe("the reminder's clock", () => {
  it("runs daily at 18:00 America/Chicago and is started by the plugin", () => {
    expect(COACH_REMINDER_QUEUE).toBe("coach-reminder");
    expect(COACH_REMINDER_DEFAULT_CRON).toBe("0 18 * * *");
    expect(coachReminderRepeat()).toEqual({
      pattern: "0 18 * * *",
      tz: "America/Chicago",
    });
    expect(COACH_REMINDER_WORKER_OPTIONS).toEqual({
      concurrency: 1,
      autorun: false,
    });
  });

  it("today is the Central calendar date, not the server's", () => {
    expect(calendarDate(new Date("2026-10-01T04:30:00Z"))).toBe("2026-09-30");
    expect(calendarDate(new Date("2026-10-01T05:30:00Z"))).toBe("2026-10-01");
  });

  it("legacy reports carry their five in the prose lists, pipeline reports in the plain lists", () => {
    expect(reminderItems(legacyBody("x"), "strengths")).toHaveLength(5);
    expect(reminderItems(legacyBody("x"), "strengths")[0]).toEqual({
      title: "x strength 1",
      detail: "Why x strength 1 matters.",
    });
    expect(
      reminderItems(
        { feedback: { recommendations: ["a", "b", "c", "d", "e", "f"] } },
        "recommendations",
      ),
    ).toEqual(["a", "b", "c", "d", "e"].map((title) => ({ title })));
  });
});
