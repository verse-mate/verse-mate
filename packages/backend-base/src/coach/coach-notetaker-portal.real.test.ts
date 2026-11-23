import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { jwt } from "@elysiajs/jwt";
import { db as Database } from "database";
import { Elysia } from "elysia";

import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import { NOTETAKER_TOKEN, NOTETAKER_URL } from "./coach-notetaker";
import { isolateTable } from "./coach-test-tables";
import coachPlugin from "./coach.plugin";
import { CoachService } from "./coach.service";

// The coach portal's notetaker routes against a stand-in notetaker gateway:
// each leader sees only their own meetings and classes, and disconnects only
// their own Zoom account.

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");

const ADMIN = "nt-portal-admin@example.test";
const LEADER_A = "nt-portal-a";
const LEADER_B = "nt-portal-b";
const EMAIL = (slug: string) => `${slug}@example.test`;
const FEED_TOKEN = "nt-portal-token";

const app = new Elysia().use(coachPlugin);
const store = app.store as unknown as { coachService: unknown };
const realService = store.coachService;
const tokens = new Map<string, string>();
const ids = new Map<string, string>();
const classIds = new Map<string, string>();
const disconnectBodies: unknown[] = [];
let gateway: ReturnType<typeof Bun.serve> | null = null;
let gatewayDown = false;

async function account(email: string) {
  const id = (
    await conn
      .insertInto("user")
      .values({ email, firstName: "N", lastName: "T", emailVerified: true })
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

async function call(as: string, method: string, path: string) {
  const res = await app.handle(
    new Request(`http://localhost/coach/${path}`, {
      method,
      headers: { authorization: `Bearer ${tokens.get(as)}` },
    }),
  );
  const text = await res.text();
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, any>) : null,
  };
}

const meeting = (id: string, host: string) => ({
  meeting_id: id,
  topic: `Study ${id}`,
  join_url: `https://zoom.us/j/${id}?pwd=x`,
  host_email: host,
  class_date: "2026-12-03",
  start_time: "19:00",
  time_zone: "America/Chicago",
  recurrence: "weekly",
  invited: false,
});

async function clear() {
  await conn
    .deleteFrom("coach_classes")
    .where("coach_id", "in", [LEADER_A, LEADER_B])
    .execute();
  await conn
    .deleteFrom("coach_leaders")
    .where("slug", "in", [LEADER_A, LEADER_B])
    .execute();
  await conn
    .deleteFrom("user")
    .where("email", "in", [ADMIN, EMAIL(LEADER_A), EMAIL(LEADER_B)])
    .execute();
}

beforeAll(async () => {
  await clear();
  gateway = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      if (gatewayDown) return new Response("down", { status: 503 });
      if (req.headers.get("authorization") !== `Bearer ${FEED_TOKEN}`)
        return new Response("no", { status: 401 });
      const path = new URL(req.url).pathname;
      if (path === "/versemate/zoom")
        return Response.json({
          connections: [
            { email: EMAIL(LEADER_A), name: "A" },
            { email: EMAIL(LEADER_B), name: "B" },
          ],
          meetings: [
            meeting("111", EMAIL(LEADER_A)),
            meeting("222", EMAIL(LEADER_B)),
          ],
        });
      if (path === "/versemate/activity")
        return Response.json({
          classes: Object.fromEntries(
            [...classIds.values()].map((id) => [
              id,
              {
                next: "2026-12-04T01:00+00:00",
                recent: [
                  {
                    start: "2026-11-27T01:00:00+00:00",
                    status: "failed",
                    reason: "not_admitted",
                    updated_at: "2026-11-27T01:40:00+00:00",
                    bot_state: "waiting_room",
                  },
                ],
              },
            ]),
          ),
        });
      if (path === "/versemate/disconnect") {
        const body = (await req.json()) as { emails: string[] };
        disconnectBodies.push(body);
        return Response.json({ disconnected: body.emails.slice(0, 1) });
      }
      if (path === "/versemate/classes-changed")
        return new Response(null, { status: 202 });
      return new Response("?", { status: 404 });
    },
  });
  process.env[NOTETAKER_URL] = `http://127.0.0.1:${gateway.port}`;
  process.env[NOTETAKER_TOKEN] = FEED_TOKEN;
  await conn
    .insertInto("coach_leaders")
    .values([
      { slug: LEADER_A, email: EMAIL(LEADER_A), name: "Nia Ash" },
      { slug: LEADER_B, email: EMAIL(LEADER_B), name: "Noah Beech" },
    ])
    .execute();
  await account(EMAIL(LEADER_A));
  await account(EMAIL(LEADER_B));
  await account(ADMIN);
  await conn.insertInto("coach_admins").values({ email: ADMIN }).execute();
  store.coachService = new CoachService(Database);
  for (const [slug, link] of [
    [LEADER_A, "https://zoom.us/j/111?pwd=x"],
    [LEADER_B, "https://zoom.us/j/222?pwd=x"],
  ] as const) {
    const created = await (store.coachService as CoachService).addClass(
      ids.get(EMAIL(slug)) as string,
      {
        name: `Class of ${slug}`,
        classDate: "2026-12-03",
        recurrence: "weekly",
        zoomLink: link,
        startTime: "19:00",
        timeZone: "America/Chicago",
        notetaker: true,
      },
    );
    classIds.set(slug, created?.id as string);
  }
});

afterAll(async () => {
  store.coachService = realService;
  delete process.env[NOTETAKER_URL];
  delete process.env[NOTETAKER_TOKEN];
  gateway?.stop(true);
  for (const email of tokens.keys()) {
    const id = ids.get(email) as string;
    await redisClient.set(cacheConstants.accessToken(id), [], "1s");
    await redisClient.delete(`rate-limit:coach:${id}`);
  }
  await clear();
});

describe("a leader manages the notetaker from the portal", () => {
  it("is offered a connect link that returns to the portal", async () => {
    const status = await call(EMAIL(LEADER_A), "GET", "notetaker/status");
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      known: true,
      connected: true,
      zoomEmail: EMAIL(LEADER_A),
      portalConnectUrl: "https://notetaker.thorsp.net/zoom/install?from=portal",
    });
  });

  it("sees only their own Zoom meetings, each marked with their class that records it", async () => {
    const { status, body } = await call(
      EMAIL(LEADER_A),
      "GET",
      "notetaker/meetings",
    );
    expect(status).toBe(200);
    expect(body?.available).toBe(true);
    expect(
      body?.meetings.map((m: { meetingId: string }) => m.meetingId),
    ).toEqual(["111"]);
    expect(body?.meetings[0].classId).toBe(classIds.get(LEADER_A));
  });

  it("sees what the bot did for their own classes only, without internal detail", async () => {
    const { status, body } = await call(
      EMAIL(LEADER_A),
      "GET",
      "notetaker/activity",
    );
    expect(status).toBe(200);
    expect(Object.keys(body?.classes ?? {})).toEqual([
      classIds.get(LEADER_A) as string,
    ]);
    expect(body?.classes[classIds.get(LEADER_A) as string]).toEqual({
      next: "2026-12-04T01:00+00:00",
      recent: [
        {
          start: "2026-11-27T01:00:00+00:00",
          status: "failed",
          reason: "not_admitted",
          updatedAt: "2026-11-27T01:40:00+00:00",
        },
      ],
    });
  });

  it("disconnects only the Zoom account on their own address", async () => {
    const { status, body } = await call(
      EMAIL(LEADER_A),
      "POST",
      "notetaker/disconnect",
    );
    expect(status).toBe(200);
    expect(body).toEqual({ available: true, disconnected: true });
    expect(disconnectBodies).toEqual([{ emails: [EMAIL(LEADER_A)] }]);
  });

  it("an admin sees every class's activity; a leader cannot use the admin route", async () => {
    const all = await call(ADMIN, "GET", "admin/notetaker/activity");
    expect(all.status).toBe(200);
    expect(Object.keys(all.body?.classes ?? {}).sort()).toEqual(
      [...classIds.values()].sort(),
    );
    expect(
      (await call(EMAIL(LEADER_A), "GET", "admin/notetaker/activity")).status,
    ).toBe(403);
  });

  it("says the notetaker is unavailable instead of failing when it does not answer", async () => {
    gatewayDown = true;
    try {
      expect(
        (await call(EMAIL(LEADER_A), "GET", "notetaker/activity")).body,
      ).toEqual({ available: false, classes: {} });
      expect(
        (await call(EMAIL(LEADER_A), "GET", "notetaker/meetings")).body,
      ).toEqual({ available: false, meetings: [] });
      expect(
        (await call(EMAIL(LEADER_A), "POST", "notetaker/disconnect")).body,
      ).toEqual({ available: false, disconnected: false });
    } finally {
      gatewayDown = false;
    }
  });
});
