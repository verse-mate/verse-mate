import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db as Database } from "database";

import {
  attributeSession,
  loadAttributionRoster,
  reattributeUnresolved,
} from "./coach-attribution";
import { CoachCoverageService } from "./coach-coverage.service";
import { CoachIntakeService } from "./coach-intake.service";
import {
  listRotatingClasses,
  loadRotatingClasses,
  saveRotatingClass,
  setRotatingOnly,
} from "./coach-rotating.service";
import { CoachService } from "./coach.service";
import type { FirefliesClient, FirefliesTranscript } from "./fireflies.client";

const conn = Database.getOrCreateConnection();
const SLUGS = ["rot-ana", "rot-ben", "rot-cy", "rot-solo"];
const GROUP = "rot-group@example.test";

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "like", "rot-%")
    .execute();
  await conn
    .deleteFrom("coach_rotating_classes")
    .where("group_email", "like", "rot-%")
    .execute();
  await conn
    .deleteFrom("coach_leader_email_requests")
    .where("slug", "in", SLUGS)
    .execute();
  await conn.deleteFrom("coach_leaders").where("slug", "in", SLUGS).execute();
}

async function seedLeaders() {
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: "rot-ana", email: "rot-ana@example.test", name: "Ana Pell" },
      { slug: "rot-ben", email: "rot-ben@example.test", name: "Ben Ostrow" },
      {
        slug: "rot-cy",
        email: "rot-cy@needs-real-email.invalid",
        name: "Cy Danner",
      },
      {
        slug: "rot-solo",
        email: "rot-solo@example.test",
        name: "Sol Ruiz",
        title_match: ["sol ruiz study"],
      },
    ])
    .execute();
}

async function markRotating() {
  return saveRotatingClass(Database, {
    name: "Harbor Men's Group",
    groupEmail: GROUP,
    titleMatch: ["harbor men"],
    leaders: ["rot-ana", "rot-ben", "rot-cy"],
  });
}

function transcript(
  over: Partial<FirefliesTranscript> & { id: string },
): FirefliesTranscript {
  return {
    title: "Weekly study",
    host_email: "bot@fireflies.ai",
    organizer_email: "bot@fireflies.ai",
    dateString: "2026-10-01T13:00:00.000Z",
    duration: 60,
    ...over,
  };
}

class OnePage implements FirefliesClient {
  constructor(private readonly items: FirefliesTranscript[]) {}
  async listTranscripts(opts: { skip?: number }) {
    return (opts.skip ?? 0) === 0 ? this.items : [];
  }
}

async function intakeRow(id: string) {
  return conn
    .selectFrom("coach_intake_sessions")
    .select(["coach_id", "matched_by", "rotating_class_id"])
    .where("source_session_id", "=", id)
    .executeTakeFirstOrThrow();
}

describe("rotating classes (task 3.14)", () => {
  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(clear);

  it("An admin marks a class as rotating: listed with its group address, keywords and leaders", async () => {
    const saved = await markRotating();
    expect(saved.ok).toBe(true);
    const classes = await listRotatingClasses(Database);
    expect(classes.find((c) => c.groupEmail === GROUP)).toEqual({
      id: expect.any(Number),
      name: "Harbor Men's Group",
      groupEmail: GROUP,
      titleMatch: ["harbor men"],
      leaders: [
        { id: "rot-ana", name: "Ana Pell", rotatingOnly: false },
        { id: "rot-ben", name: "Ben Ostrow", rotatingOnly: false },
        { id: "rot-cy", name: "Cy Danner", rotatingOnly: false },
      ],
    });
  });

  it("the next session of the class is recognised by its keywords or its group address, with no deploy", async () => {
    await markRotating();
    await new CoachIntakeService(
      Database,
      new OnePage([
        transcript({ id: "rot-by-title", title: "Harbor Men study, Amos 2" }),
        transcript({
          id: "rot-by-address",
          title: "Thursday",
          organizer_email: GROUP.toUpperCase(),
        }),
      ]),
    ).poll();
    for (const id of ["rot-by-title", "rot-by-address"]) {
      const row = await intakeRow(id);
      expect(row.coach_id).toBeNull();
      expect(row.matched_by).toBe("rotating_class");
      expect(row.rotating_class_id).toEqual(expect.any(Number));
    }
  });

  it("a rotating class's match outranks a leader's name or keywords in the title", async () => {
    await markRotating();
    const match = attributeSession(
      transcript({ id: "rot-x", title: "Harbor Men with Ana Pell" }),
      await loadAttributionRoster(Database),
      await loadRotatingClasses(Database),
    );
    expect(match).toEqual({
      coachId: null,
      matchedBy: "rotating_class",
      rotatingClassId: expect.any(Number),
    });
  });

  it("an edit applies from the next attribution: a leader taken out of the class no longer belongs to it", async () => {
    const saved = await markRotating();
    if (!saved.ok) throw new Error("not saved");
    const edited = await saveRotatingClass(
      Database,
      {
        name: "Harbor Men's Group",
        groupEmail: GROUP,
        titleMatch: ["harbor men", "harbor study"],
        leaders: ["rot-ana", "rot-ben"],
      },
      saved.id,
    );
    expect(edited.ok).toBe(true);
    const [klass] = (await loadRotatingClasses(Database)).filter(
      (c) => c.groupEmail === GROUP,
    );
    expect(klass.leaders).toEqual(["rot-ana", "rot-ben"]);
    expect(klass.titleMatch).toEqual(["harbor men", "harbor study"]);
  });

  it("the group address is refused as a leader's own address, and a leader's address is refused as a group address", async () => {
    await markRotating();
    const service = new CoachService(Database);
    expect(await service.updateLeaderEmail("rot-cy", GROUP)).toEqual({
      ok: false,
      refusal: "group-address",
    });
    expect(
      await saveRotatingClass(Database, {
        name: "Other",
        groupEmail: "rot-ana@example.test",
        titleMatch: [],
        leaders: ["rot-ana"],
      }),
    ).toEqual({ ok: false, refusal: "address-in-use" });
  });

  it("a class naming a leader not on the roster, or with no leader, is refused", async () => {
    expect(
      await saveRotatingClass(Database, {
        name: "Ghost",
        groupEmail: "rot-ghost@example.test",
        titleMatch: [],
        leaders: ["rot-nobody"],
      }),
    ).toEqual({ ok: false, refusal: "unknown-leader" });
    expect(
      await saveRotatingClass(Database, {
        name: "Empty",
        groupEmail: "rot-empty@example.test",
        titleMatch: [],
        leaders: [],
      }),
    ).toEqual({ ok: false, refusal: "no-leaders" });
  });

  it("an admin flags a leader as teaching only within a rotating class, and clears it", async () => {
    expect(await setRotatingOnly(Database, "rot-cy", true)).toBe(true);
    expect(
      (
        await conn
          .selectFrom("coach_leaders")
          .select("rotating_only")
          .where("slug", "=", "rot-cy")
          .executeTakeFirstOrThrow()
      ).rotating_only,
    ).toBe(true);
    expect(await setRotatingOnly(Database, "rot-cy", false)).toBe(true);
    expect(await setRotatingOnly(Database, "rot-nobody", true)).toBe(false);
  });

  it("the keyword sweep does not pull a rotating class's session onto one leader", async () => {
    await markRotating();
    const [klass] = (await loadRotatingClasses(Database)).filter(
      (c) => c.groupEmail === GROUP,
    );
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "rot-swept",
        coach_id: null,
        matched_by: "rotating_class",
        rotating_class_id: klass.id,
        title: "Sol Ruiz study night",
        session_date: "2026-10-01",
      })
      .execute();
    await reattributeUnresolved(Database);
    expect((await intakeRow("rot-swept")).coach_id).toBeNull();
  });

  it("A rotating class's leader led no session in the window: a leader teaching only within it is covered by the class", async () => {
    await markRotating();
    await setRotatingOnly(Database, "rot-cy", true);
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: "rot-led-by-ana",
        coach_id: "rot-ana",
        matched_by: "admin",
        title: "Harbor Men",
        session_date: "2026-10-01",
      })
      .execute();
    const report = await new CoachCoverageService(Database).assess({
      windowDays: 28,
    });
    const by = (slug: string) => report.leaders.find((l) => l.coachId === slug);
    expect(by("rot-ana")).toMatchObject({ covered: true, basis: "observed" });
    expect(by("rot-cy")).toMatchObject({
      covered: true,
      basis: "rotating-class",
      observedSessions: 0,
    });
    expect(by("rot-ben")).toMatchObject({
      covered: false,
      basis: "no-observation",
    });
  });

  it("a rotating class with no session in the window covers nobody", async () => {
    await markRotating();
    await setRotatingOnly(Database, "rot-cy", true);
    const report = await new CoachCoverageService(Database).assess({
      windowDays: 28,
    });
    expect(report.leaders.find((l) => l.coachId === "rot-cy")).toMatchObject({
      covered: false,
      basis: "no-observation",
    });
  });
});
