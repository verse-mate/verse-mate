import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { Elysia } from "elysia";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import coachDataJson from "./coach.data.json";
import coachPlugin from "./coach.plugin";

const USER = "media-routes-user";
const bundledCoach = (
  coachDataJson as unknown as {
    coaches: Array<{
      id: string;
      name: string;
      group: string;
      coachName: string;
      reports: Array<Record<string, unknown>>;
    }>;
  }
).coaches[0];
const bundledProfile = {
  id: bundledCoach.id,
  name: bundledCoach.name,
  group: bundledCoach.group,
  coachName: bundledCoach.coachName,
};
const bundledReport = bundledCoach.reports[0];
const app = new Elysia().use(coachPlugin);
const store = app.store as unknown as { coachService: unknown };
const realService = store.coachService;

const attributionWrites: unknown[][] = [];
const emailUpdates: unknown[][] = [];
const attestations: unknown[][] = [];
const reattributions: unknown[][] = [];
const minted: Array<Record<string, unknown>> = [];
const requeued: string[] = [];
const released: string[] = [];
let failuresListed = 0;
const summaryCalls: unknown[][] = [];
const detailCalls: unknown[][] = [];
let admin = true;
let token = "";

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
    isAdmin: async () => admin,
    setNotTeaching: async (...args: unknown[]) => {
      attestations.push(args);
      return args[0] === "leader-a";
    },
    assessCoverage: async () => ({
      windowDays: 30,
      allCovered: true,
      uncovered: [],
      leaders: [
        {
          coachId: "leader-a",
          name: "A",
          email: "a@example.test",
          covered: true,
          basis: "attested-not-teaching",
          observedSessions: 0,
          accountStatus: "has-account",
          linkedClassName: null,
          classAlert: false,
          attestedAt: "2026-10-08T12:00:00.000Z",
          attestedBy: "admin@example.test",
        },
      ],
    }),
    updateLeaderEmail: async (slug: string, email: string) => {
      emailUpdates.push([slug, email]);
      if (slug !== "leader-a") return { ok: false, refusal: "unknown-leader" };
      if (email === "taken@example.test")
        return { ok: false, refusal: "taken" };
      return { ok: true, email };
    },
    releaseHeldReport: async (id: string) => {
      released.push(id);
      if (id === "r-skip")
        return {
          delivered: true,
          skipped: ["wyatt@needs-real-email.invalid"],
        };
      return id === "r-held"
        ? { delivered: true }
        : { delivered: false, refusal: "not-held" };
    },
    requeuePipelineFailure: async (id: string) => {
      requeued.push(id);
      return id === "ff-parked";
    },
    getProfileById: async () => bundledProfile,
    getReportsById: async () => [
      {
        ...bundledReport,
        hasRetainedRecording: true,
        attachedRecordingUrl: "https://drive.example.test/r.mp4",
      },
    ],
    listPipelineFailures: async () => {
      failuresListed += 1;
      return [
        {
          sourceSessionId: "ff-held",
          coachId: "leader-a",
          title: "t",
          sessionDate: "2026-09-01",
          state: "delivery_pending",
          attempts: 0,
          reportId: "r-held",
          reason: "held for calibration: no calibration is recorded for v3",
          action: null,
          updatedAt: new Date("2026-09-01T00:00:00Z"),
        },
      ];
    },
    getReportSummaries: async (...args: unknown[]) => {
      summaryCalls.push(args);
      return {
        items: [
          {
            id: "r-1",
            date: "2026-09-01",
            hasRetainedRecording: true,
            attachedRecordingUrl: "https://drive.example.test/r.mp4",
          },
        ],
        total: 1,
        streakWeeks: 2,
        quarterSessions: 3,
      };
    },
    getReportDetail: async (...args: unknown[]) => {
      detailCalls.push(args);
      return args[1] === "missing"
        ? null
        : {
            ...bundledReport,
            hasRetainedRecording: true,
            attachedRecordingUrl: "https://drive.example.test/r.mp4",
          };
    },
    correctDimension: async (input: { reportId: string }) =>
      input.reportId === "legacy-r"
        ? { ok: false, refusal: "legacy-report" }
        : { ok: true, base: 70, status: { label: "On Target", emoji: "" } },
    setLeaderAttribution: async (...args: unknown[]) => {
      attributionWrites.push(args);
      return args[0] === "leader-a"
        ? {
            ok: true,
            titleMatch: ["zephaniah"],
            altEmails: ["a@example.test"],
            resolved: 2,
          }
        : { ok: false, refusal: "unknown-leader" };
    },
    reattributeSession: async (...args: unknown[]) => {
      reattributions.push(args);
      if (args[0] === "ff-flight") return { ok: false, refusal: "in-flight" };
      if (args[0] === "ff-none")
        return { ok: false, refusal: "unknown-session" };
      if (args[1] !== "leader-a")
        return { ok: false, refusal: "unknown-leader" };
      return { ok: true, state: "observed" };
    },
    getMe: async () => ({ isAdmin: false, profile: { id: "leader-a" } }),
    mintRetainedUrl: async (input: Record<string, unknown>) => {
      minted.push(input);
      return `https://storage.test/${String(input.kind)}`;
    },
  };
});

afterAll(async () => {
  store.coachService = realService;
  await redisClient.set(cacheConstants.accessToken(USER), [], "1s");
});

async function get(path: string) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

describe("each media route mints the kind it names, for the signed-in leader", () => {
  it("the transcript route mints a transcript address", async () => {
    minted.length = 0;
    const res = await get("/coach/reports/r-1/transcript-url");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      url: "https://storage.test/transcript",
    });
    expect(minted).toEqual([
      {
        reportId: "r-1",
        requesterCoachId: "leader-a",
        isAdmin: false,
        kind: "transcript",
      },
    ]);
  });

  it("the recording route still mints a recording address", async () => {
    minted.length = 0;
    const res = await get("/coach/reports/r-1/recording-url");
    expect(res.status).toBe(200);
    expect(minted.map((m) => m.kind)).toEqual(["recording"]);
  });
});

describe("the admin drill-in list carries the retained-recording flag through the response", () => {
  it("hasRetainedRecording reaches the client on each report", async () => {
    const res = await get(`/coach/admin/coaches/${bundledCoach.id}/reports`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reports: Array<{ hasRetainedRecording?: boolean }>;
    };
    expect(body.reports.map((r) => r.hasRetainedRecording)).toEqual([true]);
  });

  it("attachedRecordingUrl reaches the client on each report", async () => {
    const res = await get(`/coach/admin/coaches/${bundledCoach.id}/reports`);
    const body = (await res.json()) as {
      reports: Array<{ attachedRecordingUrl?: string | null }>;
    };
    expect(body.reports.map((r) => r.attachedRecordingUrl)).toEqual([
      "https://drive.example.test/r.mp4",
    ]);
  });
});

describe("the pipeline-failures surface carries why a session is held", () => {
  it("the hold reason reaches the admin client", async () => {
    const res = await get("/coach/admin/pipeline-failures");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessions: Array<{ reason?: string | null }>;
    };
    expect(body.sessions.map((s) => s.reason)).toEqual([
      "held for calibration: no calibration is recorded for v3",
    ]);
  });

  it("a signed-in non-admin is refused and nothing is listed", async () => {
    admin = false;
    failuresListed = 0;
    const res = await get("/coach/admin/pipeline-failures");
    admin = true;
    expect(res.status).toBe(403);
    expect(failuresListed).toBe(0);
  });

  it("the action an admin can take reaches the admin client", async () => {
    const res = await get("/coach/admin/pipeline-failures");
    const body = (await res.json()) as {
      sessions: Array<{ action?: string | null }>;
    };
    expect(body.sessions.map((s) => s.action)).toEqual([null]);
  });
});

describe("re-queueing a parked session is an admin action", () => {
  async function post(path: string, auth = true) {
    return app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: auth ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  }

  it("an admin re-queues a parked session", async () => {
    admin = true;
    requeued.length = 0;
    const res = await post("/coach/admin/pipeline-failures/ff-parked/requeue");
    expect(res.status).toBe(200);
    expect(requeued).toEqual(["ff-parked"]);
  });

  it("a session that is not parked is not found", async () => {
    admin = true;
    const res = await post("/coach/admin/pipeline-failures/ff-live/requeue");
    expect(res.status).toBe(404);
  });

  it("a signed-in non-admin is refused and nothing is re-queued", async () => {
    admin = false;
    requeued.length = 0;
    const res = await post("/coach/admin/pipeline-failures/ff-parked/requeue");
    admin = true;
    expect(res.status).toBe(403);
    expect(requeued).toEqual([]);
  });

  it("an anonymous caller is refused", async () => {
    requeued.length = 0;
    const res = await post(
      "/coach/admin/pipeline-failures/ff-parked/requeue",
      false,
    );
    expect(res.status).toBe(401);
    expect(requeued).toEqual([]);
  });
});

describe("releasing a held report is an admin action", () => {
  async function release(id: string, auth = true) {
    return app.handle(
      new Request(`http://localhost/coach/admin/reports/${id}/release`, {
        method: "POST",
        headers: auth ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  }

  it("an admin releases a held report", async () => {
    admin = true;
    released.length = 0;
    const res = await release("r-held");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ delivered: true });
    expect(released).toEqual(["r-held"]);
  });

  it("a report that is not held is not found", async () => {
    admin = true;
    expect((await release("r-other")).status).toBe(404);
  });

  it("a signed-in non-admin is refused and nothing is released", async () => {
    admin = false;
    released.length = 0;
    const res = await release("r-held");
    admin = true;
    expect(res.status).toBe(403);
    expect(released).toEqual([]);
  });

  it("an anonymous caller is refused", async () => {
    released.length = 0;
    expect((await release("r-held", false)).status).toBe(401);
    expect(released).toEqual([]);
  });
});

describe("coach routes are rate limited per caller", () => {
  async function clearLimits() {
    await redisClient.delete(`rate-limit:coach:${USER}`);
    await redisClient.delete(`rate-limit:coach-mint:${USER}`);
  }

  it("a caller gets 20 recording and transcript addresses a minute, then 429", async () => {
    await clearLimits();
    minted.length = 0;
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const kind = i % 2 === 0 ? "recording-url" : "transcript-url";
      statuses.push((await get(`/coach/reports/r-1/${kind}`)).status);
    }
    await clearLimits();
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(minted).toHaveLength(20);
  });

  it("every coach route shares a budget of 120 requests a minute per caller", async () => {
    await clearLimits();
    const statuses: number[] = [];
    for (let i = 0; i < 121; i += 1) {
      statuses.push((await get("/coach/admin/pipeline-failures")).status);
    }
    await clearLimits();
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });
});

describe("the admin reads one leader's reports a page and a report at a time", () => {
  async function anonymous(path: string) {
    return app.handle(new Request(`http://localhost${path}`));
  }

  it("an admin gets a page with its recording fields and the aggregates", async () => {
    admin = true;
    summaryCalls.length = 0;
    const res = await get(
      "/coach/admin/coaches/leader-a/reports/summary?limit=10&offset=20",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        {
          id: "r-1",
          date: "2026-09-01",
          hasRetainedRecording: true,
          attachedRecordingUrl: "https://drive.example.test/r.mp4",
        },
      ],
      total: 1,
      streakWeeks: 2,
      quarterSessions: 3,
    });
    expect(summaryCalls).toEqual([
      ["leader-a", { limit: 10, offset: 20 }, "admin"],
    ]);
  });

  it("a signed-in non-admin is refused the page and nothing is read", async () => {
    admin = false;
    summaryCalls.length = 0;
    const res = await get("/coach/admin/coaches/leader-a/reports/summary");
    admin = true;
    expect(res.status).toBe(403);
    expect(summaryCalls).toEqual([]);
  });

  it("an anonymous caller is refused the page", async () => {
    summaryCalls.length = 0;
    const res = await anonymous(
      "/coach/admin/coaches/leader-a/reports/summary",
    );
    expect(res.status).toBe(401);
    expect(summaryCalls).toEqual([]);
  });

  it("an admin gets one report, read as an admin", async () => {
    admin = true;
    detailCalls.length = 0;
    const res = await get(
      `/coach/admin/coaches/leader-a/reports/${bundledReport.id}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        id: string;
        attachedRecordingUrl: string | null;
        hasRetainedRecording: boolean;
      };
    };
    expect(body.report.id).toBe(bundledReport.id as string);
    expect(body.report.attachedRecordingUrl).toBe(
      "https://drive.example.test/r.mp4",
    );
    expect(body.report.hasRetainedRecording).toBe(true);
    expect(detailCalls).toEqual([["leader-a", bundledReport.id, "admin"]]);
  });

  it("an unknown report is not found", async () => {
    admin = true;
    const res = await get("/coach/admin/coaches/leader-a/reports/missing");
    expect(res.status).toBe(404);
  });

  it("a signed-in non-admin is refused the report and nothing is read", async () => {
    admin = false;
    detailCalls.length = 0;
    const res = await get(
      `/coach/admin/coaches/leader-a/reports/${bundledReport.id}`,
    );
    admin = true;
    expect(res.status).toBe(403);
    expect(detailCalls).toEqual([]);
  });

  it("an anonymous caller is refused the report", async () => {
    detailCalls.length = 0;
    const res = await anonymous(
      `/coach/admin/coaches/leader-a/reports/${bundledReport.id}`,
    );
    expect(res.status).toBe(401);
    expect(detailCalls).toEqual([]);
  });

  it("the leader's own page carries the aggregates too", async () => {
    summaryCalls.length = 0;
    const res = await get("/coach/reports/summary");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      streakWeeks: 2,
      quarterSessions: 3,
    });
    expect(summaryCalls).toEqual([
      ["leader-a", { limit: undefined, offset: undefined }],
    ]);
  });
});

describe("An admin tries to amend a legacy report", () => {
  it("the correction is refused, saying the report is a legacy report", async () => {
    const res = await app.handle(
      new Request(
        "http://localhost/coach/admin/reports/legacy-r/dimensions/3",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ score: 2, rationale: "too generous" }),
        },
      ),
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("legacy report");
  });
});

describe("an admin recovers an unattributable session", () => {
  async function send(method: string, path: string, body: unknown) {
    return app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("an admin writes a leader's keywords and alternate addresses", async () => {
    admin = true;
    attributionWrites.length = 0;
    const res = await send("PUT", "/coach/admin/leaders/leader-a/attribution", {
      titleMatch: ["Zephaniah"],
      altEmails: ["a@example.test"],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      titleMatch: ["zephaniah"],
      altEmails: ["a@example.test"],
      resolved: 2,
    });
    expect(attributionWrites).toEqual([
      [
        "leader-a",
        { titleMatch: ["Zephaniah"], altEmails: ["a@example.test"] },
      ],
    ]);
  });

  it("a keyword shorter than three characters is refused before anything is written", async () => {
    attributionWrites.length = 0;
    const res = await send("PUT", "/coach/admin/leaders/leader-a/attribution", {
      titleMatch: ["ab"],
      altEmails: [],
    });
    expect(res.status).toBe(400);
    expect(attributionWrites).toEqual([]);
  });

  it("an alternate address that is not an email is refused", async () => {
    attributionWrites.length = 0;
    const res = await send("PUT", "/coach/admin/leaders/leader-a/attribution", {
      titleMatch: ["zephaniah"],
      altEmails: ["not-an-address"],
    });
    expect(res.status).toBe(400);
    expect(attributionWrites).toEqual([]);
  });

  it("an unknown leader's keywords are not found", async () => {
    const res = await send("PUT", "/coach/admin/leaders/nobody/attribution", {
      titleMatch: ["zephaniah"],
      altEmails: [],
    });
    expect(res.status).toBe(404);
  });

  it("an admin assigns a session to a leader", async () => {
    reattributions.length = 0;
    const res = await send("POST", "/coach/admin/sessions/ff-1/attribute", {
      coachId: "leader-a",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      coachId: "leader-a",
      state: "observed",
    });
    expect(reattributions).toEqual([["ff-1", "leader-a"]]);
  });

  it("an unknown session or leader is not found, and a delivery in flight is a conflict", async () => {
    const statuses = [
      (
        await send("POST", "/coach/admin/sessions/ff-none/attribute", {
          coachId: "leader-a",
        })
      ).status,
      (
        await send("POST", "/coach/admin/sessions/ff-1/attribute", {
          coachId: "nobody",
        })
      ).status,
      (
        await send("POST", "/coach/admin/sessions/ff-flight/attribute", {
          coachId: "leader-a",
        })
      ).status,
    ];
    expect(statuses).toEqual([404, 404, 409]);
  });
});

describe("an admin corrects a leader's address", () => {
  async function put(path: string, body: unknown) {
    return app.handle(
      new Request(`http://localhost${path}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("the new address is stored, normalized", async () => {
    admin = true;
    emailUpdates.length = 0;
    const res = await put("/coach/admin/leaders/leader-a/email", {
      email: " Wyatt@Example.TEST ",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "wyatt@example.test" });
    expect(emailUpdates).toEqual([["leader-a", "wyatt@example.test"]]);
  });

  it("an address that is not an email is refused before anything is written", async () => {
    emailUpdates.length = 0;
    const res = await put("/coach/admin/leaders/leader-a/email", {
      email: "wyatt",
    });
    expect(res.status).toBe(400);
    expect(emailUpdates).toEqual([]);
  });

  it("an address another leader holds is a conflict, and an unknown leader is not found", async () => {
    const taken = await put("/coach/admin/leaders/leader-a/email", {
      email: "taken@example.test",
    });
    const unknown = await put("/coach/admin/leaders/nobody/email", {
      email: "x@example.test",
    });
    expect([taken.status, unknown.status]).toEqual([409, 404]);
  });

  it("releasing a report tells the admin which placeholder address was skipped", async () => {
    const res = await app.handle(
      new Request("http://localhost/coach/admin/reports/r-skip/release", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      delivered: true,
      skipped: ["wyatt@needs-real-email.invalid"],
    });
  });
});

describe("an admin attests that a leader is not teaching", () => {
  async function call(method: string, path: string) {
    return app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { authorization: `Bearer ${token}` },
      }),
    );
  }

  it("attesting records the admin as the one who attested", async () => {
    admin = true;
    attestations.length = 0;
    const res = await call(
      "POST",
      "/coach/admin/leaders/leader-a/not-teaching",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attested: true });
    expect(attestations).toEqual([["leader-a", true, USER]]);
  });

  it("clearing the attestation is its own call", async () => {
    attestations.length = 0;
    const res = await call(
      "DELETE",
      "/coach/admin/leaders/leader-a/not-teaching",
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attested: false });
    expect(attestations).toEqual([["leader-a", false, USER]]);
  });

  it("an unknown leader is not found", async () => {
    const res = await call("POST", "/coach/admin/leaders/nobody/not-teaching");
    expect(res.status).toBe(404);
  });

  it("the coverage report carries who attested and when", async () => {
    const res = await call("GET", "/coach/admin/coverage");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      leaders: Array<Record<string, unknown>>;
    };
    expect(body.leaders[0]).toMatchObject({
      basis: "attested-not-teaching",
      attestedAt: "2026-10-08T12:00:00.000Z",
      attestedBy: "admin@example.test",
    });
  });
});
