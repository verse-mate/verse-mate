import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import { COACH_PIPELINE_LIVE } from "./coach-cutover";
import { isolateTable } from "./coach-test-tables";
import { MemoryStorage } from "./coach-upload.fixture";
import coachPlugin from "./coach.plugin";
import { CoachService } from "./coach.service";

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");
isolateTable("coach_monthly_reports");

const ADMIN = "happy-admin@example.test";
const LEADER_A = "happy-a";
const LEADER_B = "happy-b";
const EMAIL = (slug: string) => `${slug}@example.test`;
const UNVERIFIED = "happy-unverified";
const GROUP = "happy-group@example.test";

class Mailer {
  sent: string[] = [];
  async sendEmail(data: { to: { email: string } }) {
    this.sent.push(data.to.email);
    return { delivered: true };
  }
}

const mailer = new Mailer();
const storage = new MemoryStorage();
const app = new Elysia().use(coachPlugin);
const store = app.store as unknown as {
  coachService: unknown;
  notification: unknown;
};
const realService = store.coachService;
const realNotification = store.notification;
const tokens = new Map<string, string>();
const ids = new Map<string, string>();

async function account(email: string, emailVerified = true) {
  const id = (
    await conn
      .insertInto("user")
      .values({ email, firstName: "H", lastName: "P", emailVerified })
      .returning("id")
      .executeTakeFirstOrThrow()
  ).id;
  const signer = new Elysia().use(
    jwt({
      name: "jwt",
      secret: process.env.AUTH_ACCESS_TOKEN_SECRET as string,
    }),
  );
  const token = await signer.decorator.jwt.sign({ sub: id });
  await redisClient.set(cacheConstants.accessToken(id), [token], "5m");
  await redisClient.delete(`rate-limit:coach:${id}`);
  tokens.set(email, token);
  ids.set(email, id);
  return id;
}

async function call(
  as: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, any> | null }> {
  const res = await app.handle(
    new Request(`http://localhost/coach/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${tokens.get(as)}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function clear() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("coach_id", "in", [LEADER_A, LEADER_B])
    .execute();
  await conn
    .deleteFrom("coach_uploads")
    .where("coach_id", "in", [LEADER_A, LEADER_B])
    .execute();
  await conn
    .deleteFrom("coach_rotating_classes")
    .where("group_email", "=", GROUP)
    .execute();
  await conn
    .deleteFrom("coach_leaders")
    .where("slug", "in", [LEADER_A, LEADER_B, UNVERIFIED])
    .execute();
  await conn
    .deleteFrom("user")
    .where("email", "in", [
      ADMIN,
      EMAIL(LEADER_A),
      EMAIL(LEADER_B),
      EMAIL(UNVERIFIED),
      "happy-second-admin@example.test",
    ])
    .execute();
}

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
}).format(new Date());

const portalBody = {
  classKey: `group:${LEADER_A}`,
  sessionDate: today,
  title: "Week 4: Romans 8",
  fileName: "saturday.mp4",
  fileBytes: 1500,
  contentType: "video/mp4",
};

beforeAll(async () => {
  process.env[COACH_PIPELINE_LIVE] = "true";
  await clear();
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: LEADER_A, email: EMAIL(LEADER_A), name: "Hap Alder" },
      { slug: LEADER_B, email: EMAIL(LEADER_B), name: "Hap Birch" },
      { slug: UNVERIFIED, email: EMAIL(UNVERIFIED), name: "Hap Unseen" },
    ])
    .execute();
  await account(EMAIL(LEADER_A));
  await account(EMAIL(LEADER_B));
  await account(EMAIL(UNVERIFIED), false);
  await account(ADMIN);
  await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
  store.coachService = new (class extends CoachService {
    override uploads() {
      return super.uploads(storage);
    }
  })(Database, mailer);
  store.notification = mailer;
});

afterAll(async () => {
  store.coachService = realService;
  store.notification = realNotification;
  delete process.env[COACH_PIPELINE_LIVE];
  for (const email of tokens.keys()) {
    const id = ids.get(email) as string;
    await redisClient.set(cacheConstants.accessToken(id), [], "1s");
    await redisClient.delete(`rate-limit:coach:${id}`);
  }
  await clear();
});

describe("a leader's upload through the routes", () => {
  let uploadId = "";

  it("the portal's request body is accepted and answers part addresses", async () => {
    const asked = await call(EMAIL(LEADER_A), "POST", "uploads", portalBody);
    expect(asked.status).toBe(200);
    expect(asked.body?.parts).toHaveLength(1);
    uploadId = asked.body?.uploadId;
  });

  it("another leader can neither get addresses for that upload nor finish it", async () => {
    expect(
      await call(EMAIL(LEADER_B), "POST", `uploads/${uploadId}/parts`),
    ).toMatchObject({
      status: 404,
      body: { details: { refusal: "unknown-upload" } },
    });
    expect(
      await call(EMAIL(LEADER_B), "POST", `uploads/${uploadId}/complete`),
    ).toMatchObject({
      status: 404,
      body: { details: { refusal: "unknown-upload" } },
    });
  });

  it("the uploader finishes it once every part has arrived, and sees it processing", async () => {
    storage.objects.set(
      `coach/uploads/${uploadId}/part-00001`,
      new Uint8Array(1500),
    );
    expect(
      await call(EMAIL(LEADER_A), "POST", `uploads/${uploadId}/complete`),
    ).toEqual({ status: 200, body: { status: "processing" } });
    const listed = await call(EMAIL(LEADER_A), "GET", "uploads");
    expect(listed.body?.uploads[0]).toMatchObject({
      id: uploadId,
      status: "processing",
      title: "Week 4: Romans 8",
    });
  });

  it("a class that is not the leader's is refused, and during the parallel run leaders cannot upload", async () => {
    expect(
      await call(EMAIL(LEADER_A), "POST", "uploads", {
        ...portalBody,
        classKey: `group:${LEADER_B}`,
      }),
    ).toMatchObject({
      status: 404,
      body: { details: { refusal: "not-your-class" } },
    });
    delete process.env[COACH_PIPELINE_LIVE];
    try {
      expect(
        await call(EMAIL(LEADER_B), "POST", "uploads", {
          ...portalBody,
          classKey: `group:${LEADER_B}`,
        }),
      ).toMatchObject({
        status: 409,
        body: { details: { refusal: "parallel-run" } },
      });
    } finally {
      process.env[COACH_PIPELINE_LIVE] = "true";
    }
  });

  it("dismissing or scoring a duplicate addressed by an upload's session id reaches the service", async () => {
    const id = encodeURIComponent(`upload:${uploadId}`);
    expect(
      await call(ADMIN, "POST", `admin/duplicates/${id}/dismiss`),
    ).toMatchObject({
      status: 404,
      body: { details: { refusal: "not-a-duplicate" } },
    });
    expect(
      await call(ADMIN, "POST", `admin/duplicates/${id}/score`),
    ).toMatchObject({
      status: 404,
      body: { details: { refusal: "not-a-duplicate" } },
    });
  });
});

describe("identity nudges through the route", () => {
  it("sends to the unconfirmed leader and skips a group address, and with no mailer claims nothing", async () => {
    await conn
      .insertInto("coach_rotating_classes")
      .values({ name: "Happy Rotation", group_email: GROUP })
      .execute();
    await conn
      .updateTable("coach_leaders")
      .set({ email: GROUP })
      .where("slug", "=", LEADER_B)
      .execute();
    mailer.sent = [];
    try {
      const nudged = await call(ADMIN, "POST", "admin/identity-nudges");
      expect(nudged.status).toBe(200);
      expect(mailer.sent).toContain(EMAIL(UNVERIFIED));
      expect(mailer.sent).not.toContain(GROUP);
      store.notification = null;
      expect(await call(ADMIN, "POST", "admin/identity-nudges")).toMatchObject({
        status: 409,
        body: { details: { refusal: "no-mailer" } },
      });
    } finally {
      store.notification = mailer;
      await conn
        .updateTable("coach_leaders")
        .set({ email: EMAIL(LEADER_B) })
        .where("slug", "=", LEADER_B)
        .execute();
    }
  });
});

describe("granting and revoking the admin role through the routes", () => {
  it("a granted admin reaches the admin routes, and after revocation is refused on the next request", async () => {
    const second = "happy-second-admin@example.test";
    await account(second);
    expect(
      await call(ADMIN, "POST", "admin/admins", { email: second }),
    ).toMatchObject({ status: 200 });
    expect((await call(second, "GET", "admin/coaches")).status).toBe(200);
    expect(
      (
        await call(
          ADMIN,
          "DELETE",
          `admin/admins/${encodeURIComponent(second)}`,
        )
      ).status,
    ).toBe(200);
    expect((await call(second, "GET", "admin/coaches")).status).toBe(403);
  });
});

describe("the monthly report routes on a real row", () => {
  it("an admin corrects every kind of text, the change is stored, and the release sends it once", async () => {
    const row = await conn
      .insertInto("coach_monthly_reports")
      .values({
        kind: "leader",
        coach_id: LEADER_A,
        month: "2031-05",
        summary: JSON.stringify({
          month: "2031-05",
          monthLabel: "May 2031",
          strengths: [{ text: "Old", session: "2031-05-02" }],
          growth: [{ text: "Old", session: "2031-05-02" }],
          trends: ["Old"],
          conversationGuide: [{ label: "Open", q: "Old?" }],
          focus: { clusterName: "Teaching Craft", goals: ["Old"] },
          clusters: [{ name: "Teaching Craft", insight: "Old" }],
        }),
        state: "held",
        hold_reason: "held for review",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const edit = {
      strengths: [{ text: "New strength", session: "2031-05-02" }],
      growth: [{ text: "New growth", session: "2031-05-02" }],
      trends: ["New trend"],
      conversationGuide: [{ label: "Open", q: "New?" }],
      focusGoals: ["New goal"],
      insights: { "Teaching Craft": "New insight" },
    };
    expect(
      await call(ADMIN, "PUT", `admin/monthly-reports/${row.id}`, edit),
    ).toEqual({ status: 200, body: { edited: true } });
    const listed = await call(
      ADMIN,
      "GET",
      "admin/monthly-reports?month=2031-05",
    );
    const summary = listed.body?.reports[0].summary;
    expect(summary.strengths[0].text).toBe("New strength");
    expect(summary.focus.goals).toEqual(["New goal"]);
    expect(summary.clusters[0].insight).toBe("New insight");
    mailer.sent = [];
    expect(
      await call(ADMIN, "POST", `admin/monthly-reports/${row.id}/release`),
    ).toEqual({ status: 200, body: { released: true, sent: true } });
    expect(mailer.sent).toEqual([EMAIL(LEADER_A)]);
  });
});
