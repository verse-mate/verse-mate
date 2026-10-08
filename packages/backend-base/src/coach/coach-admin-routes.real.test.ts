import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";
import { sql } from "kysely";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import coachPlugin from "./coach.plugin";
import { CoachService } from "./coach.service";
import { DIMENSIONS } from "./rubric";

const conn = Database.getOrCreateConnection();
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
const REPORTS = [SCORED, DELIVERED, HELD];
const SESSIONS = [
  ...REPORTS.map((id) => `ff-${id}`),
  FAILED,
  RESHARE,
  UNRESOLVED,
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
  store.coachService = new CoachService(Database, mailer);
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
    });

    expect(
      await call("POST", `sessions/${UNRESOLVED}/attribute`, {
        coachId: OTHER,
        expectedCoachId: null,
      }),
    ).toEqual({ status: 200, body: { coachId: OTHER, state: "observed" } });
  });
});
