import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import coachPlugin from "./coach.plugin";

const USER = "revision-routes-user";
const app = new Elysia().use(coachPlugin);
const store = app.store as unknown as { coachService: unknown };
const realService = store.coachService;
let token = "";
const amendCalls: unknown[] = [];
const editCalls: unknown[] = [];
const correctCalls: unknown[] = [];

const applied = {
  applied: true,
  revision: 2,
  firstLesson: false,
  base: 70,
  score: 72.5,
  status: { label: "Strong", emoji: "x" },
  sent: true,
  sends: [{ email: "a@example.test", delivered: true }],
  skipped: ["b@needs-real-email.invalid"],
};

const byReport: Record<string, unknown> = {
  "r-ok": applied,
  "r-governance": {
    applied: false,
    refusal: "governance-blocked",
    violations: [{ rule: "benchmark-name", detail: "in the body" }],
  },
  "r-cold": {
    applied: false,
    refusal: "cold-recall-improvement",
    coldRecall: ["Open with a cold recall"],
  },
  "r-legacy": { applied: false, refusal: "legacy-report" },
  "r-undelivered": { applied: false, refusal: "not-delivered" },
  "r-unknown": { applied: false, refusal: "unknown-report" },
  "r-mr": { applied: false, refusal: "memory-reinforcement-required" },
  "r-delivering": { applied: false, refusal: "in-flight" },
  "r-partial": { applied: false, refusal: "partially-delivered" },
  "r-delivered": { applied: false, refusal: "already-delivered" },
  "r-sending": { applied: false, refusal: "revision-sending" },
  "r-edited": { applied: true },
  "r-same": { applied: false, refusal: "empty-edit" },
};

beforeAll(async () => {
  const signer = new Elysia().use(
    jwt({
      name: "jwt",
      secret: process.env.AUTH_ACCESS_TOKEN_SECRET as string,
    }),
  );
  token = await signer.decorator.jwt.sign({ sub: USER });
  await redisClient.set(cacheConstants.accessToken(USER), [token], "5m");
  store.coachService = {
    isAdmin: async () => true,
    amendReport: async (input: { reportId: string }) => {
      amendCalls.push(input);
      return byReport[input.reportId];
    },
    setFirstLesson: async (input: { reportId: string }) =>
      byReport[input.reportId],
    editImprovements: async (input: { reportId: string }) => {
      editCalls.push(input);
      return byReport[input.reportId];
    },
    correctDimension: async (input: unknown) => {
      correctCalls.push(input);
      return { ok: false, refusal: "partially-delivered" };
    },
    listRevisions: async () => [
      {
        kind: "revision",
        revision: 1,
        previous: { firstLesson: false },
        changes: {
          body: {
            headline: { from: "a", to: "b" },
            improvementsProse: {
              from: [{ title: "Quiet", paragraphs: ["Ask them."] }],
              to: null,
            },
          },
        },
        amendedBy: null,
        amendedAt: new Date("2026-10-08T12:00:00Z"),
        sentTo: ["a@example.test"],
        skipped: [],
        sentAt: null,
        attemptedTo: ["b@example.test"],
      },
      {
        kind: "edit",
        edit: 7,
        changes: {
          improvements: { from: ["cold recall"], to: ["quiet members"] },
          improvementsProse: { from: null, to: null },
        },
        editedBy: "admin@example.test",
        editedAt: new Date("2026-10-07T12:00:00Z"),
      },
    ],
    requeueRevision: async (id: string) => id === "r-ok",
    sendRevision: async (id: string) =>
      id === "r-ok"
        ? { sent: true, revision: 1, sends: [], skipped: [] }
        : {
            sent: false,
            refusal:
              id === "r-none"
                ? "no-revision"
                : id === "r-busy"
                  ? "in-flight"
                  : id === "r-moved"
                    ? "not-live"
                    : "parallel-run",
          },
  };
  await redisClient.delete(`rate-limit:coach:${USER}`);
});

afterAll(async () => {
  store.coachService = realService;
  await redisClient.set(cacheConstants.accessToken(USER), [], "1s");
  await redisClient.delete(`rate-limit:coach:${USER}`);
});

function call(method: string, path: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost/coach/admin/reports/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

describe("the revision routes", () => {
  it("an applied amendment answers with the recomputed score, its revision and what was sent", async () => {
    const res = await call("POST", "r-ok/amend", {
      dimensions: [{ n: 5, score: 2, rationale: "fewer questions" }],
      body: { headline: "revised", improvements: ["one", "two"] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      applied: true,
      revision: 2,
      firstLesson: false,
      base: 70,
      score: 72.5,
      status: "Strong",
      sent: true,
      sends: [{ email: "a@example.test", delivered: true }],
      skipped: ["b@needs-real-email.invalid"],
    });
  });

  it("an amendment's prose reaches the service", async () => {
    amendCalls.length = 0;
    const prose = [{ title: "Newcomers", paragraphs: ["Ask them first."] }];
    const res = await call("POST", "r-ok/amend", {
      body: { improvements: ["Ask newcomers first"], improvementsProse: prose },
    });
    expect(res.status).toBe(200);
    expect(amendCalls).toEqual([
      {
        reportId: "r-ok",
        amendment: {
          body: {
            improvements: ["Ask newcomers first"],
            improvementsProse: prose,
          },
        },
        byUserId: USER,
      },
    ]);
  });

  it("a governance block or a cold-recall hold is an answer, not an error, carrying the details", async () => {
    const blocked = await call("POST", "r-governance/amend", {
      body: { headline: "x" },
    });
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toEqual({
      applied: false,
      refusal: "governance-blocked",
      violations: ["benchmark-name: in the body"],
    });

    const held = await call("PUT", "r-cold/first-lesson", {
      firstLesson: true,
    });
    expect(held.status).toBe(200);
    expect(await held.json()).toEqual({
      applied: false,
      refusal: "cold-recall-improvement",
      coldRecall: ["Open with a cold recall"],
    });
  });

  it("refusals map to the status a client can act on", async () => {
    const cases: Array<[string, string, string, unknown, number]> = [
      ["POST", "r-legacy/amend", "legacy", { body: { headline: "x" } }, 409],
      [
        "POST",
        "r-undelivered/amend",
        "not delivered",
        { body: { headline: "x" } },
        409,
      ],
      ["POST", "r-unknown/amend", "unknown", { body: { headline: "x" } }, 404],
      ["POST", "r-sending/amend", "sending", { body: { headline: "x" } }, 409],
      ["PUT", "r-legacy/first-lesson", "legacy", { firstLesson: true }, 409],
      ["PUT", "r-mr/first-lesson", "memory", { firstLesson: false }, 400],
      [
        "PUT",
        "r-delivering/first-lesson",
        "in flight",
        { firstLesson: true },
        409,
      ],
    ];
    for (const [method, path, _label, body, status] of cases) {
      expect((await call(method, path, body)).status).toBe(status);
    }
  });

  it("a report already emailed to some recipients is refused a correction and the flag with a 409 saying so", async () => {
    for (const res of [
      await call("PUT", "r-partial/first-lesson", { firstLesson: true }),
      await call("POST", "r-partial/dimensions/1", {
        score: 2,
        rationale: "x",
      }),
    ]) {
      expect(res.status).toBe(409);
      const text = await res.text();
      expect(text).toContain("already emailed");
      expect(text).toContain("fix that recipient's address");
      expect(text).toContain("requeue");
      expect(text).not.toContain("once delivery completes");
    }
  });

  it("an undelivered report's improvements are edited, bullets and prose, by the admin who asked", async () => {
    editCalls.length = 0;
    const prose = [{ title: "Quiet members", paragraphs: ["Ask them first."] }];
    const res = await call("PUT", "r-edited/improvements", {
      improvements: ["Call on quiet members"],
      improvementsProse: prose,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: true });
    expect(editCalls).toEqual([
      {
        reportId: "r-edited",
        improvements: ["Call on quiet members"],
        improvementsProse: prose,
        byUserId: USER,
      },
    ]);
  });

  it("an improvements edit that keeps a cold recall is an answer naming it, and a delivered report is sent to amend", async () => {
    const cold = await call("PUT", "r-cold/improvements", {
      improvements: ["Open with a cold recall"],
    });
    expect(cold.status).toBe(200);
    expect(await cold.json()).toEqual({
      applied: false,
      refusal: "cold-recall-improvement",
      coldRecall: ["Open with a cold recall"],
    });
    const delivered = await call("PUT", "r-delivered/improvements", {
      improvements: ["x"],
    });
    expect(delivered.status).toBe(409);
    expect(await delivered.text()).toContain("Amend it instead");
    const partial = await call("PUT", "r-partial/improvements", {
      improvements: ["x"],
    });
    expect(partial.status).toBe(409);
  });

  it("an improvements edit that changes nothing is refused with a 400, as an empty amendment is", async () => {
    const res = await call("PUT", "r-same/improvements", {
      improvements: ["x"],
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("changes nothing");
  });

  it("an improvements edit without the bullets never reaches the service", async () => {
    editCalls.length = 0;
    const res = await call("PUT", "r-edited/improvements", {
      improvementsProse: [],
    });
    expect(res.status).toBe(422);
    expect(editCalls).toEqual([]);
  });

  it.each([
    ["a fractional score", "1", { score: 2.5, rationale: "x" }],
    ["a score above 5", "1", { score: 6, rationale: "x" }],
    ["a score below 1", "1", { score: 0, rationale: "x" }],
    [
      "a rationale over 4000 characters",
      "1",
      { score: 2, rationale: "x".repeat(4001) },
    ],
    ["dimension 0", "0", { score: 2, rationale: "x" }],
    ["dimension 13", "13", { score: 2, rationale: "x" }],
    ["a dimension that is not a number", "abc", { score: 2, rationale: "x" }],
    ["a fractional dimension", "1.5", { score: 2, rationale: "x" }],
  ])("a correction with %s never reaches the service", async (_, n, body) => {
    correctCalls.length = 0;
    const res = await call("POST", `r-ok/dimensions/${n}`, body);
    expect([400, 422]).toContain(res.status);
    expect(correctCalls).toEqual([]);
  });

  it("a well-formed correction reaches the service with an integer dimension", async () => {
    correctCalls.length = 0;
    await call("POST", "r-ok/dimensions/12", {
      score: null,
      rationale: "x".repeat(4000),
    });
    expect(correctCalls).toMatchObject([{ dimensionN: 12, score: null }]);
  });

  it("a score outside 1 to 5 never reaches the service", async () => {
    const before = amendCalls.length;
    const res = await call("POST", "r-ok/amend", {
      dimensions: [{ n: 5, score: 7, rationale: "x" }],
    });
    expect(res.status).toBe(422);
    expect(amendCalls.length).toBe(before);
  });

  it("lists the kept versions, and sends the latest revision on request", async () => {
    const list = await call("GET", "r-ok/revisions");
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      revisions: Array<Record<string, unknown>>;
    };
    expect(body.revisions[0].revision).toBe(1);
    expect(body.revisions[0].attemptedTo).toEqual(["b@example.test"]);
    expect(body.revisions[0].changes).toEqual({
      body: {
        headline: { from: "a", to: "b" },
        improvementsProse: {
          from: [{ title: "Quiet", paragraphs: ["Ask them."] }],
          to: null,
        },
      },
    });

    expect(body.revisions[1]).toEqual({
      kind: "edit",
      edit: 7,
      changes: {
        improvements: { from: ["cold recall"], to: ["quiet members"] },
        improvementsProse: { from: null, to: null },
      },
      editedBy: "admin@example.test",
      editedAt: "2026-10-07T12:00:00.000Z",
    });
    expect(body.revisions[0]).toMatchObject({ kind: "revision" });

    expect((await call("POST", "r-ok/revision/send")).status).toBe(200);
    expect((await call("POST", "r-none/revision/send")).status).toBe(404);
    expect((await call("POST", "r-live/revision/send")).status).toBe(409);
    const busy = await call("POST", "r-busy/revision/send");
    expect(busy.status).toBe(409);
    expect(await busy.text()).toContain("being sent");
    const moved = await call("POST", "r-moved/revision/send");
    expect(moved.status).toBe(409);
    expect(await moved.text()).toContain("not live");
  });

  it("requeues a revision whose send was left unconfirmed, and answers 404 when there is none to requeue", async () => {
    const requeued = await call("POST", "r-ok/revision/requeue");
    expect(requeued.status).toBe(200);
    expect(await requeued.json()).toEqual({ requeued: true });
    expect((await call("POST", "r-none/revision/requeue")).status).toBe(404);
  });
});
