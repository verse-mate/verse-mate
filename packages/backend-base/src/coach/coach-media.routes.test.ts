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

const minted: Array<Record<string, unknown>> = [];
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
    isAdmin: async () => true,
    getProfileById: async () => bundledProfile,
    getReportsById: async () => [
      { ...bundledReport, hasRetainedRecording: true },
    ],
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
});
