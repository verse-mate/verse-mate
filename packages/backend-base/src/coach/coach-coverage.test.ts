import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import { CoachCoverageService } from "./coach-coverage.service";

const conn = Database.getOrCreateConnection();
const EMAILS = [
  "cov-observed@example.test",
  "cov-silent@example.test",
  "cov-attested@example.test",
  "cov-noaccount@example.test",
];

async function clear() {
  await conn.deleteFrom("coach_intake_sessions").execute();
  const users = await conn
    .selectFrom("user")
    .select("id")
    .where("email", "in", EMAILS)
    .execute();
  if (users.length > 0) {
    await conn
      .deleteFrom("coach_classes")
      .where(
        "user_id",
        "in",
        users.map((u) => u.id),
      )
      .execute();
  }
  await conn.deleteFrom("user").where("email", "in", EMAILS).execute();
  await conn.deleteFrom("coach_leaders").where("email", "in", EMAILS).execute();
}

/** A registered leader: roster row + account + a class carrying `zoomLink`. */
async function withClass(
  slug: string,
  email: string,
  zoomLink: string,
): Promise<void> {
  await leader(slug, email);
  const user = await conn
    .insertInto("user")
    .values({
      email,
      firstName: slug,
      lastName: "Test",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await conn
    .insertInto("coach_classes")
    .values({
      user_id: user.id,
      name: `${slug} class`,
      zoom_link: zoomLink,
    })
    .execute();
}

async function leader(slug: string, email: string, over = {}) {
  await conn
    .insertInto("coach_leaders")
    .values({ slug, email, name: slug, ...over })
    .execute();
}

async function observed(coachId: string, daysAgo: number) {
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: `ff-${coachId}-${daysAgo}`,
      coach_id: coachId,
      matched_by: "title_match",
      title: "s",
      session_date: when.toISOString().slice(0, 10),
      observed_at: when,
    })
    .execute();
}

describe("bot coverage is OBSERVED, never inferred from configuration", () => {
  beforeEach(clear);
  afterEach(clear);

  it("a leader with a session observed inside the window is covered", async () => {
    // No provider API lists the bot's configured joins — Fireflies exposes
    // Users / Transcripts / Transcript / Bites / Analytics / Active Meetings
    // and nothing that enumerates upcoming or configured joins. So coverage is
    // what intake has actually seen.
    await leader("cov-observed", "cov-observed@example.test");
    await observed("cov-observed", 3);

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-observed");
    expect(row?.covered).toBe(true);
    expect(row?.basis).toBe("observed");
  });

  it("a session OLDER than the window does not count as coverage", async () => {
    await leader("cov-silent", "cov-silent@example.test");
    await observed("cov-silent", 90);

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-silent");
    expect(row?.covered).toBe(false);
    expect(row?.basis).toBe("no-observation");
  });

  it("a leader who is not teaching is covered ONLY by explicit attestation", async () => {
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: new Date(),
    });

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-attested");
    expect(row?.covered).toBe(true);
    expect(row?.basis).toBe("attested-not-teaching");
  });

  it("an uncovered leader is SURFACED — the whole point, since they would silently get no reports", async () => {
    await leader("cov-silent", "cov-silent@example.test");

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    expect(report.uncovered.map((l) => l.coachId)).toContain("cov-silent");
    expect(report.allCovered).toBe(false);
  });

  it("a roster leader with no VerseMate account is classified explicitly, not lumped in", async () => {
    // The roster keys on email; coach_classes keys on user.id. A leader who
    // never registered has no classes row for reasons that have nothing to do
    // with coverage, and saying so is different from saying 'no class linked'.
    await leader("cov-noaccount", "cov-noaccount@example.test");

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-noaccount");
    expect(row?.accountStatus).toBe("no-account");
    expect(row?.classAlert).toBe(false);
  });

  it("a linked class with a NON-EMPTY link and no observed session raises an alert", async () => {
    await withClass(
      "cov-silent",
      "cov-silent@example.test",
      "https://zoom.example/abc",
    );

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-silent");
    expect(row?.covered).toBe(false);
    expect(row?.classAlert).toBe(true);
    expect(row?.linkedClassName).toBe("cov-silent class");
  });

  it("a class row with an EMPTY link raises NOTHING — presence is not intent", async () => {
    // zoom_link is notNull().defaultTo(""), so every class row has the column.
    // Treating the ROW as intent would alert on every leader who ever opened
    // the class form, which is noise an admin learns to ignore — and an alert
    // that gets ignored is worse than no alert.
    await withClass("cov-silent", "cov-silent@example.test", "");

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    const row = report.leaders.find((l) => l.coachId === "cov-silent");
    expect(row?.covered).toBe(false);
    expect(row?.classAlert).toBe(false);
    expect(row?.linkedClassName).toBeNull();
  });

  it("a linked class does NOT make a leader covered — it is intent, not proof", async () => {
    await withClass(
      "cov-silent",
      "cov-silent@example.test",
      "https://zoom.example/abc",
    );
    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    expect(report.allCovered).toBe(false);
  });

  it("allCovered is the gate 9.1 reads before an irreversible step", async () => {
    await leader("cov-observed", "cov-observed@example.test");
    await observed("cov-observed", 1);
    await leader("cov-attested", "cov-attested@example.test", {
      not_teaching_attested_at: new Date(),
    });

    const report = await new CoachCoverageService(Database).assess({
      windowDays: 30,
    });
    expect(report.allCovered).toBe(true);
    expect(report.uncovered.length).toBe(0);
  });
});
