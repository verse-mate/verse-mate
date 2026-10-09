import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";
import { sql } from "kysely";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { isolateTable } from "./coach-test-tables";
import { MemoryStorage } from "./coach-upload.fixture";
import coachPlugin from "./coach.plugin";
import { COACH_REFUSALS } from "./coach.schema";
import { CoachService } from "./coach.service";
import { DIMENSIONS } from "./rubric";

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");
const ADMIN_EMAIL = "real-routes-admin@example.test";
const LEADER = "real-routes-leader";
const OTHER = "real-routes-other";
const LEADER_EMAIL = "real-routes-leader@example.test";
const OTHER_EMAIL = "real-routes-other@example.test";
const SCORED = "real-routes-scored";
const DELIVERED = "real-routes-delivered";
const HELD = "real-routes-held";
const FAILED = "ff-real-routes-failed";
const RESHARE = "ff-real-routes-reshare";
const UNRESOLVED = "ff-real-routes-unresolved";
const PARALLEL = "ff-real-routes-parallel";
const REPORTS = [SCORED, DELIVERED, HELD];
const SESSIONS = [
  ...REPORTS.map((id) => `ff-${id}`),
  FAILED,
  RESHARE,
  UNRESOLVED,
  PARALLEL,
];

class FakeMailer {
  accept = true;
  sent: string[] = [];
  async sendEmail(data: { to: { email: string } }) {
    this.sent.push(data.to.email);
    return this.accept
      ? { delivered: true }
      : { delivered: false, error: "rejected" };
  }
}

const mailer = new FakeMailer();
const app = new Elysia().use(coachPlugin);
const store = app.store as unknown as { coachService: unknown };
const realService = store.coachService;
let userId = "";
let token = "";

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "in", SESSIONS)
    .execute();
  await conn.deleteFrom("coach_reports").where("id", "in", REPORTS).execute();
  await conn
    .deleteFrom("coach_leaders")
    .where("slug", "in", [LEADER, OTHER])
    .execute();
  await conn
    .deleteFrom("coach_leader_email_requests")
    .where("slug", "in", [LEADER, OTHER])
    .execute();
  await conn
    .deleteFrom("coach_admins")
    .where("email", "=", ADMIN_EMAIL)
    .execute();
  await conn.deleteFrom("user").where("email", "=", ADMIN_EMAIL).execute();
}

async function report(
  id: string,
  state: string,
  options: { delivered?: boolean; dimensions?: boolean } = {},
) {
  await conn
    .insertInto("coach_reports")
    .values({
      id,
      coach_id: LEADER,
      session_date: "2026-09-26",
      source_session_id: `ff-${id}`,
      legacy_ids: [],
      held: !options.delivered,
      summary: { session: "Nahum, Lesson 1", score: 80, status: "Strong" },
      metrics: JSON.stringify({
        newcomerBonus: 0,
        sizeBonus: 0,
        dimensions: DIMENSIONS.map((d) => ({
          n: d.n,
          name: d.name,
          score: 4,
          note: `note ${d.n}`,
        })),
      }),
      body: JSON.stringify({
        bigIdeas: [],
        feedback: {
          headline: "A steady session",
          strengths: ["Scripture first"],
          improvements: ["Call on quiet members"],
          recommendations: ["Ask one open question"],
        },
      }),
    })
    .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values({
      source_session_id: `ff-${id}`,
      coach_id: LEADER,
      matched_by: "title_match",
      title: "Nahum, Lesson 1",
      session_date: "2026-09-26",
      state,
      report_id: id,
      ...(options.delivered
        ? {
            delivered_to: [LEADER_EMAIL, ADMIN_EMAIL],
            published: true,
          }
        : {}),
    })
    .execute();
  if (options.dimensions === false) return;
  await conn
    .insertInto("coach_report_dimension_scores")
    .values(
      DIMENSIONS.map((d) => ({
        report_id: id,
        dimension_n: d.n,
        score: 4,
        rationale: `note ${d.n}`,
        provenance: "machine",
        model_version: "v3-weighted-100",
      })),
    )
    .execute();
}

beforeAll(async () => {
  await clear();
  process.env[COACH_PIPELINE_LIVE] = "true";
  userId = (
    await conn
      .insertInto("user")
      .values({
        email: ADMIN_EMAIL,
        firstName: "Real",
        lastName: "Routes",
        emailVerified: true,
      })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  await conn
    .insertInto("coach_admins")
    .values({ email: ADMIN_EMAIL })
    .execute();
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: LEADER, email: LEADER_EMAIL, name: "Rhea Ronan" },
      { slug: OTHER, email: OTHER_EMAIL, name: "Otto Penhallow" },
    ])
    .execute();
  await report(SCORED, "scored");
  await report(DELIVERED, "delivered", { delivered: true });
  await report(HELD, "scored", { dimensions: false });
  await conn
    .insertInto("coach_intake_sessions")
    .values([
      {
        source_session_id: FAILED,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Nahum, Lesson 2",
        session_date: "2026-09-27",
        state: "delivery_failed",
        hold_kind: "send-failed",
        hold_reason: "send failed",
      },
      {
        source_session_id: RESHARE,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Nahum, Lesson 3",
        session_date: "2026-09-28",
        state: "retrieval_failed",
        reshare_requested_at: sql`NOW()`,
      },
      {
        source_session_id: PARALLEL,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Nahum, observed in the parallel run",
        session_date: "2026-09-25",
        state: "retrieval_failed",
        reshare_requested_at: sql`NOW()`,
        parallel_run: true,
      },
      {
        source_session_id: UNRESOLVED,
        coach_id: null,
        matched_by: "unresolved",
        title: "An evening group nobody claimed",
        session_date: "2026-09-29",
        state: "observed",
      },
    ])
    .execute();

  const signer = new Elysia().use(
    jwt({
      name: "jwt",
      secret: process.env.AUTH_ACCESS_TOKEN_SECRET as string,
    }),
  );
  token = await signer.decorator.jwt.sign({ sub: userId });
  await redisClient.set(cacheConstants.accessToken(userId), [token], "5m");
  await redisClient.delete(`rate-limit:coach:${userId}`);
  store.coachService = new (class extends CoachService {
    override uploads() {
      return super.uploads(new MemoryStorage());
    }
  })(Database, mailer);
});

afterAll(async () => {
  store.coachService = realService;
  delete process.env[COACH_PIPELINE_LIVE];
  await redisClient.set(cacheConstants.accessToken(userId), [], "1s");
  await redisClient.delete(`rate-limit:coach:${userId}`);
  await clear();
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.handle(
    new Request(`http://localhost/coach/admin/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, any>) : null,
  };
}

describe("every admin route answers through the real service within its response schema", () => {
  it("review, correction, first-lesson flag and improvements on an undelivered report", async () => {
    const review = await call("GET", `reports/${SCORED}/review`);
    expect(review.status).toBe(200);
    expect(review.body?.dimensions).toHaveLength(DIMENSIONS.length);

    const corrected = await call("POST", `reports/${SCORED}/dimensions/3`, {
      score: 2,
      rationale: "fewer questions than the passage needed",
    });
    expect(corrected.status).toBe(200);
    expect(Object.keys(corrected.body ?? {}).sort()).toEqual([
      "base",
      "score",
      "status",
    ]);

    const flagged = await call("PUT", `reports/${SCORED}/first-lesson`, {
      firstLesson: true,
    });
    expect(flagged.status).toBe(200);
    expect(flagged.body?.applied).toBe(true);

    const edited = await call("PUT", `reports/${SCORED}/improvements`, {
      improvements: ["Ask one open question per passage"],
    });
    expect(edited.status).toBe(200);
    expect(edited.body?.applied).toBe(true);
  });

  it("amend, revisions, revision requeue and revision send on a delivered report", async () => {
    mailer.accept = false;
    const amended = await call("POST", `reports/${DELIVERED}/amend`, {
      body: { headline: "A steadier session than it first read" },
    });
    mailer.accept = true;
    expect(amended.status).toBe(200);
    expect(amended.body).toMatchObject({ applied: true, revision: 1 });

    const listed = await call("GET", `reports/${DELIVERED}/revisions`);
    expect(listed.status).toBe(200);
    expect(listed.body?.revisions[0]).toMatchObject({
      kind: "revision",
      revision: 1,
    });

    await conn
      .updateTable("coach_report_amendments")
      .set({ attempted_to: sql`ARRAY[${LEADER_EMAIL}]::text[]` })
      .where("report_id", "=", DELIVERED)
      .execute();
    const requeued = await call(
      "POST",
      `reports/${DELIVERED}/revision/requeue`,
    );
    expect(requeued).toEqual({ status: 200, body: { requeued: true } });

    const sent = await call("POST", `reports/${DELIVERED}/revision/send`);
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ sent: true, revision: 1 });
  });

  it("coverage and the not-teaching attestation", async () => {
    const coverage = await call("GET", "coverage");
    expect(coverage.status).toBe(200);
    expect(typeof coverage.body?.allCovered).toBe("boolean");
    expect(await call("POST", `leaders/${LEADER}/not-teaching`)).toEqual({
      status: 200,
      body: { attested: true },
    });
    expect(await call("DELETE", `leaders/${LEADER}/not-teaching`)).toEqual({
      status: 200,
      body: { attested: false },
    });
  });

  it("the parallel-run comparison", async () => {
    const comparison = await call("GET", "parallel-run/comparison");
    expect(comparison.status).toBe(200);
    expect(Array.isArray(comparison.body?.sessions)).toBe(true);
    expect(comparison.body?.unmatched).toBeDefined();
    expect(typeof comparison.body?.counts.compared).toBe("number");
  });

  it("re-share listing, send and resolve", async () => {
    const listed = await call("GET", "reshares");
    expect(listed.status).toBe(200);
    expect(
      listed.body?.requests.find(
        (r: { sourceSessionId: string }) => r.sourceSessionId === RESHARE,
      ),
    ).toMatchObject({ asked: false, parallelRun: false });
    expect(await call("POST", `reshares/${RESHARE}/send`)).toEqual({
      status: 200,
      body: { sent: true },
    });
    expect(await call("POST", `reshares/${RESHARE}/resolve`)).toEqual({
      status: 200,
      body: { resolved: true },
    });
  });

  it("the failures list, a release and a requeue", async () => {
    const failures = await call("GET", "pipeline-failures?limit=200");
    expect(failures.status).toBe(200);
    expect(
      failures.body?.sessions.find(
        (s: { sourceSessionId: string }) => s.sourceSessionId === FAILED,
      ),
    ).toMatchObject({ holdKind: "send-failed", action: "requeue" });

    const released = await call("POST", `reports/${HELD}/release`);
    expect(released.status).toBe(200);
    expect(released.body?.delivered).toBe(true);

    expect(await call("POST", `pipeline-failures/${FAILED}/requeue`)).toEqual({
      status: 200,
      body: { requeued: true },
    });
  });

  it("a leader's attribution, address and a session's assignment", async () => {
    expect(await call("GET", `leaders/${LEADER}/attribution`)).toEqual({
      status: 200,
      body: { titleMatch: [], altEmails: [] },
    });
    const saved = await call("PUT", `leaders/${LEADER}/attribution`, {
      titleMatch: ["nahum circle"],
      altEmails: [],
    });
    expect(saved.status).toBe(200);
    expect(saved.body?.titleMatch).toEqual(["nahum circle"]);

    const moved = await call("PUT", `leaders/${OTHER}/email`, {
      email: "real-routes-other.new@example.test",
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      email: "real-routes-other.new@example.test",
      status: "pending",
    });

    expect(
      await call("POST", `sessions/${UNRESOLVED}/attribute`, {
        coachId: OTHER,
        expectedCoachId: null,
      }),
    ).toEqual({ status: 200, body: { coachId: OTHER, state: "observed" } });
  });
});

describe("the upload and duplicate routes", () => {
  afterAll(async () => {
    await conn
      .deleteFrom("coach_uploads")
      .where("coach_id", "=", LEADER)
      .execute();
  });

  it("an admin lists a leader's classes, asks for upload addresses, cannot finish before the file arrives, and sees the upload listed", async () => {
    const classes = await call("GET", `uploads/classes?coachId=${LEADER}`);
    expect(classes).toEqual({
      status: 200,
      body: {
        classes: [
          { key: `group:${LEADER}`, name: expect.any(String), kind: "group" },
        ],
      },
    });
    const asked = await call("POST", "uploads", {
      coachId: LEADER,
      classKey: `group:${LEADER}`,
      sessionDate: new Date(Date.now() - 3 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      title: null,
      fileName: "session.mp4",
      fileBytes: 1024,
      contentType: "video/mp4",
    });
    expect(asked.status).toBe(200);
    expect(asked.body?.parts).toHaveLength(1);
    const early = await call(
      "POST",
      `uploads/${asked.body?.uploadId}/complete`,
    );
    expect(early).toMatchObject({
      status:
        COACH_REFUSALS["POST /coach/admin/uploads/:id/complete"][
          "file-incomplete"
        ].status,
      body: { details: { refusal: "file-incomplete" } },
    });
    const listed = await call("GET", `uploads?coachId=${LEADER}`);
    expect(listed.body?.uploads[0]).toMatchObject({
      id: asked.body?.uploadId,
      status: "uploading",
    });
    const refused = await call("POST", "uploads", {
      coachId: LEADER,
      classKey: `group:${LEADER}`,
      sessionDate: "2999-01-01",
      fileName: "session.mp4",
      fileBytes: 1024,
      contentType: "video/mp4",
    });
    expect(refused).toMatchObject({
      status: 400,
      body: { details: { refusal: "date-in-future" } },
    });
  });

  it("the leader's own upload routes refuse an account that is not a leader", async () => {
    const res = await app.handle(
      new Request("http://localhost/coach/uploads", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(403);
    const anonymous = await app.handle(
      new Request("http://localhost/coach/uploads"),
    );
    expect(anonymous.status).toBe(401);
  });

  it("likely duplicates are listed, and dismissing one that is not waiting is coded", async () => {
    const listed = await call("GET", "duplicates");
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body?.duplicates)).toBe(true);
    expect(await call("POST", "duplicates/nothing-here/dismiss")).toMatchObject(
      {
        status: 404,
        body: { details: { refusal: "not-a-duplicate" } },
      },
    );
  });
});

describe("the monthly report admin routes", () => {
  it("list, edit, release and produce answer within their schemas, and refusals are coded", async () => {
    const listed = await call("GET", "monthly-reports?month=2031-01");
    expect(listed).toEqual({ status: 200, body: { reports: [] } });
    expect(
      await call("PUT", "monthly-reports/999999", { trends: ["x"] }),
    ).toMatchObject({
      status: 404,
      body: { details: { refusal: "unknown-summary" } },
    });
    expect(await call("POST", "monthly-reports/999999/release")).toMatchObject({
      status: 404,
      body: { details: { refusal: "unknown-summary" } },
    });
    expect(
      await call("POST", "monthly-reports/produce", { month: "2031-9" }),
    ).toMatchObject({
      status: 400,
      body: { details: { refusal: "invalid-month" } },
    });
  });
});

describe("the rotating-class admin routes", () => {
  const GROUP = "real-routes-group@example.test";
  afterAll(async () => {
    await conn
      .deleteFrom("coach_rotating_classes")
      .where("group_email", "=", GROUP)
      .execute();
  });

  it("an admin marks a class as rotating, edits it, lists it and flags a leader as teaching only within it", async () => {
    const created = await call("POST", "rotating-classes", {
      name: "Harbor Group",
      groupEmail: GROUP,
      titleMatch: ["harbor group"],
      leaders: [LEADER, OTHER],
    });
    expect(created.status).toBe(200);
    const id = created.body?.id as number;
    const edited = await call("PUT", `rotating-classes/${id}`, {
      name: "Harbor Group",
      groupEmail: GROUP,
      titleMatch: ["harbor group"],
      leaders: [LEADER],
    });
    expect(edited.status).toBe(200);
    const flagged = await call("PUT", `leaders/${LEADER}/rotating-only`, {
      rotatingOnly: true,
    });
    expect(flagged).toEqual({ status: 200, body: { rotatingOnly: true } });
    const listed = await call("GET", "rotating-classes");
    expect(listed.status).toBe(200);
    expect(
      listed.body?.classes.find((c: { id: number }) => c.id === id),
    ).toEqual({
      id,
      name: "Harbor Group",
      groupEmail: GROUP,
      titleMatch: ["harbor group"],
      leaders: [{ id: LEADER, name: expect.any(String), rotatingOnly: true }],
    });
  });

  it("refusals are coded: a leader's address as the group address, an unknown leader or class, and the group address as a leader's own", async () => {
    const route = (r: string) => r as keyof typeof COACH_REFUSALS;
    const expectRefused = async (
      r: string,
      res: { status: number; body: Record<string, any> | null },
      code: string,
    ) => {
      const listed = (
        COACH_REFUSALS[route(r)] as Record<
          string,
          { status: number; message: string }
        >
      )[code];
      expect(listed).toBeDefined();
      expect(res).toMatchObject({
        status: listed.status,
        body: { details: { refusal: code } },
      });
    };
    const body = (over: Record<string, unknown>) => ({
      name: "Harbor Group",
      groupEmail: GROUP,
      titleMatch: [],
      leaders: [LEADER],
      ...over,
    });
    await expectRefused(
      "POST /coach/admin/rotating-classes",
      await call(
        "POST",
        "rotating-classes",
        body({ groupEmail: LEADER_EMAIL }),
      ),
      "address-in-use",
    );
    await expectRefused(
      "POST /coach/admin/rotating-classes",
      await call(
        "POST",
        "rotating-classes",
        body({ leaders: ["nobody-here"] }),
      ),
      "unknown-leader",
    );
    await expectRefused(
      "PUT /coach/admin/rotating-classes/:id",
      await call(
        "PUT",
        "rotating-classes/999999",
        body({ groupEmail: "real-routes-other-group@example.test" }),
      ),
      "unknown-class",
    );
    await expectRefused(
      "PUT /coach/admin/leaders/:id/rotating-only",
      await call("PUT", "leaders/nobody-here/rotating-only", {
        rotatingOnly: true,
      }),
      "unknown-leader",
    );
    await call("POST", "rotating-classes", body({}));
    await expectRefused(
      "PUT /coach/admin/leaders/:id/email",
      await call("PUT", `leaders/${OTHER}/email`, { email: GROUP }),
      "group-address",
    );
  });
});

describe("every admin refusal carries a structured code with the status and words the contract lists", () => {
  async function refused(
    route: keyof typeof COACH_REFUSALS,
    path: string,
    code: string,
    body?: unknown,
  ) {
    const [method] = route.split(" ");
    const res = await call(method, path, body);
    const listed = (
      COACH_REFUSALS[route] as Record<
        string,
        { status: number; message: string }
      >
    )[code];
    expect(listed).toBeDefined();
    expect(res).toMatchObject({
      status: listed.status,
      body: { message: listed.message, details: { refusal: code } },
    });
  }

  it("a parallel-run session's re-share send is a 409 coded parallel-run-session", async () => {
    await refused(
      "POST /coach/admin/reshares/:sourceSessionId/send",
      `reshares/${PARALLEL}/send`,
      "parallel-run-session",
    );
  });

  it("the other state refusals of the admin routes are coded", async () => {
    await refused(
      "POST /coach/admin/reshares/:sourceSessionId/send",
      "reshares/ff-real-routes-nobody/send",
      "unknown-session",
    );
    await refused(
      "POST /coach/admin/reports/:reportId/release",
      `reports/${DELIVERED}/release`,
      "not-held",
    );
    await refused(
      "POST /coach/admin/pipeline-failures/:sourceSessionId/requeue",
      "pipeline-failures/ff-real-routes-nobody/requeue",
      "not-parked",
    );
    await refused(
      "POST /coach/admin/reports/:reportId/revision/send",
      `reports/${SCORED}/revision/send`,
      "no-revision",
    );
    await refused(
      "POST /coach/admin/reports/:reportId/revision/requeue",
      `reports/${SCORED}/revision/requeue`,
      "nothing-to-requeue",
    );
    await refused(
      "POST /coach/admin/reports/:reportId/dimensions/:dimensionN",
      `reports/${DELIVERED}/dimensions/2`,
      "already-delivered",
      { score: 2, rationale: "x" },
    );
    await refused(
      "PUT /coach/admin/reports/:reportId/improvements",
      `reports/${DELIVERED}/improvements`,
      "already-delivered",
      { improvements: ["Ask one open question"] },
    );
    await refused(
      "POST /coach/admin/reports/:reportId/amend",
      `reports/${SCORED}/amend`,
      "not-delivered",
      { body: { headline: "x" } },
    );
    await refused(
      "GET /coach/admin/reports/:reportId/review",
      "reports/real-routes-nobody/review",
      "unknown-report",
    );
    await refused(
      "PUT /coach/admin/leaders/:id/email",
      `leaders/${LEADER}/email`,
      "taken",
      { email: OTHER_EMAIL },
    );
    await refused(
      "PUT /coach/admin/leaders/:id/email",
      `leaders/${LEADER}/email`,
      "invalid-address",
      { email: "not an address" },
    );
    await refused(
      "GET /coach/admin/leaders/:id/attribution",
      "leaders/real-routes-nobody/attribution",
      "unknown-leader",
    );
    await refused(
      "POST /coach/admin/sessions/:sourceSessionId/attribute",
      `sessions/${UNRESOLVED}/attribute`,
      "already-assigned",
      { coachId: OTHER, expectedCoachId: OTHER },
    );
    await refused(
      "POST /coach/admin/leaders/:id/not-teaching",
      "leaders/real-routes-nobody/not-teaching",
      "unknown-leader",
    );
  });
});

describe("the parallel-run comparison route", () => {
  const MEMBER_EMAIL = "real-routes-member@example.test";
  const COMPARED = "ff-real-routes-compared";
  const PAIR = ["ff-real-routes-pair-a", "ff-real-routes-pair-b"];
  const ALONE = "ff-real-routes-alone";
  const BACKEND = [COMPARED, ...PAIR, ALONE];
  const HOST = "real-routes-host-2026-11-02";
  let memberId = "";
  let memberToken = "";

  async function backendSession(id: string, date: string) {
    await conn
      .insertInto("coach_reports")
      .values({
        id,
        coach_id: LEADER,
        session_date: date,
        source_session_id: id,
        legacy_ids: [],
        held: true,
        summary: {},
        metrics: JSON.stringify({ newcomerBonus: 0, sizeBonus: 0 }),
        body: {},
      })
      .execute();
    await conn
      .insertInto("coach_report_dimension_scores")
      .values(
        DIMENSIONS.map((d) => ({
          report_id: id,
          dimension_n: d.n,
          score: 4,
          machine_score: 4,
          rationale: "r",
          provenance: "machine",
          model_version: "v3-weighted-100",
        })),
      )
      .execute();
    await conn
      .insertInto("coach_intake_sessions")
      .values({
        source_session_id: id,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "t",
        session_date: date,
        state: "scored",
        report_id: id,
        parallel_run: true,
      })
      .execute();
  }

  async function clearComparison() {
    await conn
      .deleteFrom("coach_intake_sessions")
      .where("source_session_id", "in", BACKEND)
      .execute();
    await conn
      .deleteFrom("coach_reports")
      .where("id", "in", [...BACKEND, HOST])
      .execute();
    await conn.deleteFrom("user").where("email", "=", MEMBER_EMAIL).execute();
  }

  beforeAll(async () => {
    await clearComparison();
    await backendSession(COMPARED, "2026-11-02");
    for (const id of PAIR) await backendSession(id, "2026-11-03");
    await backendSession(ALONE, "2026-11-04");
    await conn
      .insertInto("coach_reports")
      .values({
        id: HOST,
        coach_id: LEADER,
        session_date: "2026-11-02",
        source_session_id: `legacy:${LEADER}:2026-11-02`,
        legacy_ids: [],
        summary: { score: 80 },
        metrics: JSON.stringify({
          dimensions: DIMENSIONS.map((d) => ({ n: d.n, score: 4 })),
        }),
        body: {},
      })
      .execute();
    memberId = (
      await conn
        .insertInto("user")
        .values({
          email: MEMBER_EMAIL,
          firstName: "Mira",
          lastName: "Member",
          emailVerified: true,
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
    const signer = new Elysia().use(
      jwt({
        name: "jwt",
        secret: process.env.AUTH_ACCESS_TOKEN_SECRET as string,
      }),
    );
    memberToken = await signer.decorator.jwt.sign({ sub: memberId });
    await redisClient.set(
      cacheConstants.accessToken(memberId),
      [memberToken],
      "5m",
    );
  });

  afterAll(async () => {
    await redisClient.set(cacheConstants.accessToken(memberId), [], "1s");
    await redisClient.delete(`rate-limit:coach:${memberId}`);
    await clearComparison();
  });

  const comparisonAs = (bearer: string | null) =>
    app.handle(
      new Request("http://localhost/coach/admin/parallel-run/comparison", {
        headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      }),
    );

  it("an anonymous caller gets 401 and a signed-in leader who is not an admin 403", async () => {
    expect((await comparisonAs(null)).status).toBe(401);
    expect((await comparisonAs(memberToken)).status).toBe(403);
  });

  it("an admin gets one compared session, one pair to make and one unmatched session, within the response schema", async () => {
    const { status, body } = await call("GET", "parallel-run/comparison");
    expect(status).toBe(200);
    const ours = (c: { coachId: string }) => c.coachId === LEADER;
    expect(body?.sessions.filter(ours)).toEqual([
      {
        coachId: LEADER,
        date: "2026-11-02",
        backend: {
          sourceSessionId: COMPARED,
          reportId: COMPARED,
          composite: expect.any(Number),
        },
        host: { reportId: HOST, composite: 80 },
        compositeDifference: expect.any(Number),
        dimensions: expect.any(Array),
        withinOne: 12,
        comparable: 12,
        flagged: expect.any(Boolean),
      },
    ]);
    expect(body?.needsPairing.filter(ours)).toEqual([
      {
        coachId: LEADER,
        date: "2026-11-03",
        backend: PAIR.map((id) => ({ sourceSessionId: id, reportId: id })),
        host: [],
      },
    ]);
    expect(body?.unmatched.backend.filter(ours)).toEqual([
      {
        coachId: LEADER,
        date: "2026-11-04",
        sourceSessionId: ALONE,
        reportId: ALONE,
      },
    ]);
  });
});
