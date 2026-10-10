import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { db as Database } from "database";
import { sql } from "kysely";

import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import {
  attributeSession,
  loadAttributionRoster,
  reattributeSession,
  reattributeUnresolved,
} from "./coach-attribution";
import { CoachCoverageService } from "./coach-coverage.service";
import { CoachIntakeService } from "./coach-intake.service";
import { CoachPipelineService } from "./coach-pipeline.service";
import {
  bodyAnswer,
  bodySentences,
  isBodyCall,
} from "./coach-report-body.fixture";
import {
  listRotatingClasses,
  loadRotatingClasses,
  saveRotatingClass,
  setRotatingOnly,
} from "./coach-rotating.service";
import {
  CoachScoringService,
  type ScoringInput,
} from "./coach-scoring.service";
import { CoachService } from "./coach.service";
import type {
  FirefliesClient,
  FirefliesDetailClient,
  FirefliesTranscript,
  FirefliesTranscriptDetail,
} from "./fireflies.client";
import { DIMENSIONS } from "./rubric";

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

  it("an address a leader is changing to cannot become a class's group address, and a change to an address that became one is refused", async () => {
    const token = "rot-pending-token";
    await conn
      .insertInto("coach_leader_email_requests")
      .values({
        slug: "rot-ana",
        new_email: GROUP,
        token_hash: createHash("sha256").update(token).digest("hex"),
        expires_at: sql`now() + interval '1 day'`,
      } as never)
      .execute();
    expect(await markRotating()).toEqual({
      ok: false,
      refusal: "address-in-use",
    });
    await conn
      .insertInto("coach_rotating_classes")
      .values({ name: "Harbor", group_email: GROUP })
      .execute();
    expect(
      await new CoachService(Database).confirmLeaderEmailChange(token),
    ).toEqual({ ok: false, refusal: "taken" });
    expect(
      (
        await conn
          .selectFrom("coach_leaders")
          .select("email")
          .where("slug", "=", "rot-ana")
          .executeTakeFirstOrThrow()
      ).email,
    ).toBe("rot-ana@example.test");
  });

  it("a leader's other address, in any case, cannot be a class's group address", async () => {
    await conn
      .updateTable("coach_leaders")
      .set({ alt_emails: ["Rot-Group@Example.test"] })
      .where("slug", "=", "rot-solo")
      .execute();
    expect(await markRotating()).toEqual({
      ok: false,
      refusal: "address-in-use",
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

  it("a new leader cannot be added on a rotating class's group address", async () => {
    await markRotating();
    expect(
      await new CoachService(Database).addLeader("admin", { email: GROUP }),
    ).toEqual({ ok: false, reason: "group-address" });
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

describe("naming a rotating class's leader (task 5.19)", () => {
  const SESSION = "rot-pipe-1";
  const LINES = {
    prayAna: "Lord, give Ana wisdom as she leads us tonight.",
    prayGuest: "Lord, bless our guest Marco as he leads the opening.",
    readBen: "Ben, would you read verse three for us?",
    bothRead: "Ana and Ben, split the chapter between you.",
  };

  class CueAi implements AiProvider {
    readonly name = "fake";
    baselines: Array<number | null> = [];
    calls = 0;
    constructor(private readonly cues: unknown[]) {}
    async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
      this.calls += 1;
      if (
        opts.messages[0]?.content ===
        CoachScoringService.buildLeaderCueInstructions()
      )
        return { content: JSON.stringify({ cues: this.cues }), model: "fake" };
      if (isBodyCall(opts)) return { content: bodyAnswer(), model: "fake" };
      if (opts.messages.some((m) => m.images?.length))
        return {
          content: JSON.stringify({ score: 4, rationale: "a map on screen" }),
          model: "fake",
        };
      return {
        content: JSON.stringify({
          dimensions: DIMENSIONS.map((d) => ({
            n: d.n,
            score: 4,
            rationale: `a genuine reason for dimension ${d.n}`,
          })),
        }),
        model: "fake",
      };
    }
    private no(): never {
      throw new Error("not part of the pipeline");
    }
    responsesCreate = () => this.no();
    filesCreate = () => this.no();
    filesRetrieve = () => this.no();
    filesContent = () => this.no();
    batchesCreate = () => this.no();
    batchesRetrieve = () => this.no();
    batchesCancel = () => this.no();
  }

  class Client implements FirefliesDetailClient {
    async listTranscripts() {
      return [];
    }
    async getTranscript(): Promise<FirefliesTranscriptDetail> {
      const extra = Object.values(LINES).map((text, i) => ({
        index: 100 + i,
        speakerId: `speaker-${i + 4}`,
        isLeader: false,
        text,
        start_time: 2000 + i * 10,
        end_time: null,
      }));
      return {
        id: SESSION,
        title: "Harbor Men with Sol Ruiz",
        host_email: null,
        organizer_email: null,
        dateString: "2026-10-01T13:00:00.000Z",
        duration: 60,
        audio_url: null,
        video_url: null,
        transcript_url: null,
        participantCount: 10,
        summary: null,
        sentences: [...bodySentences(), ...extra],
      };
    }
  }

  class BaselineSpy extends CoachScoringService {
    seen: Array<number | null | undefined> = [];
    override async scoreSession(input: ScoringInput) {
      this.seen.push(input.authenticityBaseline);
      return super.scoreSession(input);
    }
  }

  async function run(cues: unknown[]) {
    const saved = await markRotating();
    if (!saved.ok) throw new Error("not saved");
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: SESSION,
        coach_id: null,
        matched_by: "rotating_class",
        rotating_class_id: saved.id,
        title: "Harbor Men with Sol Ruiz",
        session_date: "2026-10-01",
        state: "retained",
      })
      .execute();
    const ai = new CueAi(cues);
    const scoring = new BaselineSpy(Database, ai);
    const pipeline = new CoachPipelineService(Database, new Client(), null, {
      scoring,
      frames: { extract: async () => [] } as never,
    });
    const [result] = await pipeline.run();
    return { result, ai, scoring, pipeline };
  }

  async function session() {
    return conn
      .selectFrom("coach_intake_sessions")
      .select([
        "coach_id",
        "matched_by",
        "leader_cue",
        "leader_cue_line",
        "report_id",
        "state",
      ])
      .where("source_session_id", "=", SESSION)
      .executeTakeFirstOrThrow();
  }

  beforeEach(async () => {
    await clear();
    await seedLeaders();
  });
  afterEach(async () => {
    await conn
      .deleteFrom("coach_reports")
      .where("coach_id", "in", SLUGS)
      .execute();
    await clear();
  });

  const cue = (name: string, people: string[], line: string) => ({
    cue: name,
    people,
    line,
  });

  it("The opening prayer names this week's leader: the session is theirs, recording the cue, even though the title names another leader", async () => {
    const { result } = await run([
      cue("opening_prayer", ["Ana"], LINES.prayAna),
      cue("reading", ["Ben"], LINES.readBen),
    ]);
    expect(result.reportId).toBeTruthy();
    expect(await session()).toMatchObject({
      coach_id: "rot-ana",
      leader_cue: "opening_prayer",
      leader_cue_line: LINES.prayAna,
    });
    const report = await conn
      .selectFrom("coach_reports")
      .select("coach_id")
      .where("id", "=", result.reportId as string)
      .executeTakeFirstOrThrow();
    expect(report.coach_id).toBe("rot-ana");
  });

  it("The opening prayer names a guest: the guest is passed over and the leader who calls on readers decides", async () => {
    await run([
      cue("opening_prayer", ["Marco"], LINES.prayGuest),
      cue("reading", ["Ben Ostrow"], LINES.readBen),
    ]);
    expect(await session()).toMatchObject({
      coach_id: "rot-ben",
      leader_cue: "reading",
    });
  });

  it("a cue line copied with its time and speaker, as the model sees it, still counts", async () => {
    await run([
      cue("opening_prayer", ["Ana"], `[00:33:20] speaker-4: ${LINES.prayAna}`),
    ]);
    expect((await session()).coach_id).toBe("rot-ana");
  });

  it("a guest who shares a leader's first name is not that leader", async () => {
    await run([
      cue("opening_prayer", ["Ana Guestly"], LINES.prayAna),
      cue("reading", ["Ben"], LINES.readBen),
    ]);
    expect((await session()).coach_id).toBe("rot-ben");
  });

  it("The leader is the one who assigns the readings: an opening prayer naming no one is skipped", async () => {
    await run([
      cue("opening_prayer", [], ""),
      cue("reading", ["Ben"], LINES.readBen),
    ]);
    expect((await session()).coach_id).toBe("rot-ben");
  });

  it("a cue naming two of the class's leaders, or citing a line nobody said, is skipped", async () => {
    await run([
      cue("opening_prayer", ["Ana", "Ben"], LINES.bothRead),
      cue("reading", ["Cy"], "Cy, read the whole chapter please."),
      cue("application", ["Ben"], LINES.readBen),
    ]);
    expect(await session()).toMatchObject({
      coach_id: "rot-ben",
      leader_cue: "application",
    });
  });

  it("A rotating class's leader cannot be told: the session waits in the unresolved queue, is not tried again, and is scored once an admin assigns it", async () => {
    const { result, ai, pipeline } = await run([
      cue("opening_prayer", ["Marco"], LINES.prayGuest),
      cue("reading", ["Ana", "Ben"], LINES.bothRead),
    ]);
    expect(result.outcome).toBe("attribution-unresolved");
    expect(await session()).toMatchObject({
      coach_id: null,
      leader_cue: "none",
      report_id: null,
    });
    const calls = ai.calls;
    await pipeline.run();
    expect(ai.calls).toBe(calls);
    const listed = (
      await new CoachService(Database).listPipelineFailures()
    ).sessions.find((s) => s.sourceSessionId === SESSION);
    expect(listed).toMatchObject({
      action: "attribute",
      reason:
        "unattributed: the transcript did not name which of the rotating class's leaders led",
    });
    await reattributeSession(Database, SESSION, "rot-cy", null);
    const [scored] = await pipeline.run();
    expect(scored.reportId).toBeTruthy();
    expect((await session()).coach_id).toBe("rot-cy");
  });

  it("Rotating leaders keep separate baselines: the session is scored against the named leader's own history", async () => {
    for (const [slug, authenticity, date] of [
      ["rot-ana", 2, "2026-09-10"],
      ["rot-ben", 5, "2026-09-17"],
    ] as const)
      await conn
        .insertInto("coach_reports")
        .values({
          id: `rot-history-${slug}`,
          coach_id: slug,
          session_date: date,
          source_session_id: `rot-history-${slug}`,
          legacy_ids: [],
          summary: {},
          metrics: JSON.stringify({
            dimensions: [{ n: 8, score: authenticity }],
          }),
          body: {},
        })
        .execute();
    const { scoring } = await run([cue("reading", ["Ben"], LINES.readBen)]);
    expect(scoring.seen).toEqual([5]);
  });
});
