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
    listRevisions: async () => [
      {
        revision: 1,
        previous: { firstLesson: false },
        changes: { body: { headline: { from: "a", to: "b" } } },
        amendedBy: null,
        amendedAt: new Date("2026-10-08T12:00:00Z"),
        sentTo: ["a@example.test"],
        skipped: [],
        sentAt: null,
      },
    ],
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
      ["PUT", "r-legacy/first-lesson", "legacy", { firstLesson: true }, 409],
      ["PUT", "r-mr/first-lesson", "memory", { firstLesson: false }, 400],
    ];
    for (const [method, path, _label, body, status] of cases) {
      expect((await call(method, path, body)).status).toBe(status);
    }
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
      revisions: Array<{ revision: number }>;
    };
    expect(body.revisions[0].revision).toBe(1);

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
});
