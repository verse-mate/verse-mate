import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { db as Database } from "database";

import { AuthService } from "../auth/auth.service";
import redisClient from "../shared/redis-client";
import {
  type Account,
  FakeMailer,
  account,
  caller,
  clearLearning,
  conn,
  dropAccounts,
  learningApp,
  makeAdmin,
  resetLimits,
} from "./coach-learning.fixture";

const EMAILS = [
  "requests-admin@example.test",
  "requests-learner@example.test",
  "requests-second@example.test",
  "requests-leader@example.test",
];
const SLUGS = [
  "ruth-requester",
  "ruth-renamed",
  "requests-leader",
  "lydia-leader",
];
const { app, mailer, restore } = learningApp();
const call = caller(app);
let admin: Account;
let learner: Account;
let second: Account;
let leader: Account;
let moduleId = 0;
let lessonId = 0;

const as = (who: Account) => ({
  get: (p: string) => call(who, "GET", p),
  post: (p: string, b?: unknown) => call(who, "POST", p, b ?? {}),
});

async function clearLeaders() {
  await conn.deleteFrom("coach_leaders").where("slug", "in", SLUGS).execute();
  await conn.deleteFrom("coach_leaders").where("email", "in", EMAILS).execute();
}

beforeAll(async () => {
  admin = await account(EMAILS[0], { firstName: "Ada", lastName: "Admin" });
  await makeAdmin(admin);
});

afterAll(async () => {
  restore();
  await clearLearning();
  await clearLeaders();
  await conn
    .deleteFrom("coach_admins")
    .where("email", "=", EMAILS[0])
    .execute();
  await dropAccounts(EMAILS);
});

beforeEach(async () => {
  await clearLearning();
  await clearLeaders();
  mailer.sent = [];
  learner = await account(EMAILS[1], {
    firstName: "Ruth",
    lastName: "Requester",
  });
  second = await account(EMAILS[2], { firstName: "Sam", lastName: "Second" });
  leader = await account(EMAILS[3], { firstName: "Lydia", lastName: "Leader" });
  await resetLimits(admin, learner, second, leader);
  const a = as(admin);
  moduleId = (
    await a.post("admin/learning/modules", {
      title: "Only",
      description: "",
      passMark: 50,
    })
  ).body?.id;
  lessonId = (
    await a.post(`admin/learning/modules/${moduleId}/lessons`, {
      title: "L",
      body: "",
      passages: [],
    })
  ).body?.id;
  await a.post(`admin/learning/lessons/${lessonId}/publish`);
  await a.post(`admin/learning/modules/${moduleId}/questions`, {
    prompt: "Q",
    options: ["yes", "no"],
    correct: 0,
  });
  await a.post(`admin/learning/modules/${moduleId}/publish`);
});

async function complete(who: Account) {
  await as(who).post("learning/enrol");
  await as(who).post(`learning/lessons/${lessonId}/done`);
  const check = await as(who).get(`learning/modules/${moduleId}/check`);
  await as(who).post(`learning/modules/${moduleId}/check`, {
    version: check.body?.version,
    answers: [{ questionId: check.body?.questions[0].id, option: 0 }],
  });
  const state = await as(who).get("learning");
  expect(state.body?.completedAt).not.toBeNull();
  return state;
}

async function requested(who: Account, note = "I lead a Tuesday group") {
  await complete(who);
  const res = await as(who).post("learning/join-request", { note });
  expect(res.status).toBe(200);
  return res.body?.request.id as number;
}

describe("sending a request", () => {
  it("Sending a request: open for the learner and listed for admins", async () => {
    const id = await requested(learner, "Please add me");
    const state = await as(learner).get("learning");
    expect(state.body?.request).toMatchObject({
      id,
      status: "open",
      note: "Please add me",
    });
    const list = await as(admin).get("admin/learning/requests");
    expect(list.body?.requests).toEqual([
      expect.objectContaining({
        id,
        name: "Ruth Requester",
        email: EMAILS[1],
        note: "Please add me",
        scores: [{ moduleId, title: "Only", bestScore: 100 }],
      }),
    ]);
    expect(list.body?.requests[0].completedAt).not.toBeNull();
  });

  it("Unverified address, including one marked verified before the confirmation existed: no request", async () => {
    await conn
      .updateTable("user")
      .set({ email_verified_at: null })
      .where("id", "=", learner.id as never)
      .execute();
    await complete(learner);
    const res = await as(learner).post("learning/join-request", { note: "" });
    expect(res.status).toBe(403);
    expect(res.body?.details.refusal).toBe("confirm-email");
    expect((await as(learner).get("learning")).body?.addressConfirmed).toBe(
      false,
    );
    expect(
      await conn
        .selectFrom("coach_learning_join_requests")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("Request before completion: no request", async () => {
    await as(learner).post("learning/enrol");
    const res = await as(learner).post("learning/join-request", {});
    expect(res.body?.details.refusal).toBe("not-completed");
    expect(
      await conn
        .selectFrom("coach_learning_join_requests")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("A note longer than 500 characters is refused", async () => {
    await complete(learner);
    const res = await as(learner).post("learning/join-request", {
      note: "x".repeat(501),
    });
    expect(res.status).toBe(422);
  });

  it("A second open request: none created, the open one shown", async () => {
    const id = await requested(learner);
    const res = await as(learner).post("learning/join-request", {
      note: "again",
    });
    expect(res.status).toBe(409);
    expect(res.body?.details).toMatchObject({
      refusal: "request-exists",
      request: { id, status: "open" },
    });
    expect(
      await conn
        .selectFrom("coach_learning_join_requests")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
  });

  it("An approved learner, or one closed as already in the program, cannot request again", async () => {
    const id = await requested(learner);
    expect(
      (await as(admin).post(`admin/learning/requests/${id}/approve`, {}))
        .status,
    ).toBe(200);
    const again = await as(learner).post("learning/join-request", {});
    expect(again.status).toBe(409);
    expect(again.body?.details.refusal).toBe("already-leader");

    const otherId = await requested(second);
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "requests-leader",
        email: EMAILS[2],
        name: "Somebody Else",
      })
      .execute();
    const dup = await as(admin).post(
      `admin/learning/requests/${otherId}/approve`,
      {},
    );
    expect(dup.body?.status).toBe("already-in-program");
    await conn
      .deleteFrom("coach_leaders")
      .where("slug", "=", "requests-leader")
      .execute();
    const res = await as(second).post("learning/join-request", {});
    expect(res.body?.details).toMatchObject({
      refusal: "request-exists",
      request: { status: "already-in-program" },
    });
  });

  it("After a decline the learner may send a new request", async () => {
    const id = await requested(learner);
    await as(admin).post(`admin/learning/requests/${id}/decline`, {
      reason: "Not yet",
    });
    const res = await as(learner).post("learning/join-request", {
      note: "Trying again",
    });
    expect(res.status).toBe(200);
    expect(res.body?.request.status).toBe("open");
  });

  it("An evaluated leader finishes the program: no join request offered", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "lydia-leader", email: EMAILS[3], name: "Lydia Leader" })
      .execute();
    const state = await complete(leader);
    expect(state.body?.isLeader).toBe(true);
    const res = await as(leader).post("learning/join-request", {});
    expect(res.body?.details.refusal).toBe("already-leader");
  });
});

describe("answering a request", () => {
  it("Approving: a leader with no sessions, one invitation, approved for the learner, and their next visit opens the dashboard", async () => {
    const id = await requested(learner);
    expect((await as(learner).get("me")).status).toBe(403);
    const res = await as(admin).post(`admin/learning/requests/${id}/approve`, {
      group: "Tuesday",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "approved",
      leaderId: "ruth-requester",
    });
    expect(mailer.sent).toEqual([EMAILS[1]]);
    const row = await conn
      .selectFrom("coach_leaders")
      .select(["email", "name", "group_name", "user_id"])
      .where("slug", "=", "ruth-requester")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      email: EMAILS[1],
      name: "Ruth Requester",
      group_name: "Tuesday",
      user_id: learner.id as never,
    });
    const me = await as(learner).get("me");
    expect(me.status).toBe(200);
    expect(me.body?.isCoach).toBe(true);
    expect((await as(learner).get("learning")).body?.request.status).toBe(
      "approved",
    );
    expect(
      (await as(admin).get("admin/learning/requests")).body?.requests,
    ).toEqual([]);
  });

  it("The address is already in the program: no duplicate, closed as already in the program", async () => {
    const id = await requested(learner);
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "ruth-renamed", email: EMAILS[1], name: "Ruth Renamed" })
      .execute();
    const res = await as(admin).post(
      `admin/learning/requests/${id}/approve`,
      {},
    );
    expect(res.body?.status).toBe("already-in-program");
    expect(mailer.sent).toEqual([]);
    const leaders = await conn
      .selectFrom("coach_leaders")
      .select("slug")
      .where("email", "=", EMAILS[1])
      .execute();
    expect(leaders).toEqual([{ slug: "ruth-renamed" }]);
  });

  it("A name another leader already uses: nothing added, stays open, the admin sees why and can retry with another name", async () => {
    const id = await requested(learner);
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "ruth-requester",
        email: "someone-else@example.test",
        name: "Ruth Requester",
      })
      .execute();
    const res = await as(admin).post(
      `admin/learning/requests/${id}/approve`,
      {},
    );
    expect(res.status).toBe(409);
    expect(res.body?.details).toMatchObject({
      refusal: "add-refused",
      addRefusal: "slug-taken",
    });
    expect(res.body?.message).toBe(
      'Another leader already uses the id "ruth-requester". Enter a different name.',
    );
    expect((await as(learner).get("learning")).body?.request.status).toBe(
      "open",
    );
    expect(mailer.sent).toEqual([]);
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "=", "someone-else@example.test")
      .execute();
    await conn
      .insertInto("coach_leaders")
      .values({
        slug: "ruth-requester",
        email: "someone-else@example.test",
        name: "Ruth Requester",
      })
      .execute();
    const retry = await as(admin).post(
      `admin/learning/requests/${id}/approve`,
      { name: "Ruth Renamed" },
    );
    expect(retry.body).toEqual({
      status: "approved",
      leaderId: "ruth-renamed",
    });
    await conn
      .deleteFrom("coach_leaders")
      .where("email", "=", "someone-else@example.test")
      .execute();
  });

  it("The address changed since the request and is not confirmed: no leader for either address, stays open", async () => {
    const id = await requested(learner);
    await conn
      .updateTable("user")
      .set({
        email: "requests-moved@example.test",
        email_verified_at: null,
        emailVerified: false,
      })
      .where("id", "=", learner.id as never)
      .execute();
    const res = await as(admin).post(
      `admin/learning/requests/${id}/approve`,
      {},
    );
    expect(res.status).toBe(409);
    expect(res.body?.details.refusal).toBe("address-unconfirmed");
    const leaders = await conn
      .selectFrom("coach_leaders")
      .select("slug")
      .where("email", "in", [EMAILS[1], "requests-moved@example.test"])
      .execute();
    expect(leaders).toEqual([]);
    const row = await conn
      .selectFrom("coach_learning_join_requests")
      .select("status")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("open");
    await conn
      .deleteFrom("user")
      .where("email", "=", "requests-moved@example.test")
      .execute();
  });

  it("Answering a request that is no longer open: nothing changes, no email, the current state shown", async () => {
    const id = await requested(learner);
    await as(admin).post(`admin/learning/requests/${id}/decline`, {
      reason: "Not now",
    });
    for (const path of ["approve", "decline"]) {
      const res = await as(admin).post(
        `admin/learning/requests/${id}/${path}`,
        {},
      );
      expect(res.status).toBe(409);
      expect(res.body?.details).toEqual({
        refusal: "not-open",
        status: "declined",
        reason: "Not now",
      });
    }
    expect(mailer.sent).toEqual([]);
  });

  it("Approve and decline at once: one answer wins whole, never a leader on a declined request", async () => {
    const id = await requested(learner);
    const [approved, declined] = await Promise.all([
      as(admin).post(`admin/learning/requests/${id}/approve`, {}),
      as(admin).post(`admin/learning/requests/${id}/decline`, {
        reason: "Not now",
      }),
    ]);
    expect([approved.status, declined.status].sort()).toEqual([200, 409]);
    const row = await conn
      .selectFrom("coach_learning_join_requests")
      .select("status")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    const leaders = await conn
      .selectFrom("coach_leaders")
      .select("slug")
      .where("email", "=", EMAILS[1])
      .execute();
    if (approved.status === 200) {
      expect(row.status).toBe("approved");
      expect(leaders).toHaveLength(1);
      expect(mailer.sent).toEqual([EMAILS[1]]);
    } else {
      expect(row.status).toBe("declined");
      expect(leaders).toEqual([]);
      expect(mailer.sent).toEqual([]);
    }
  });

  it("Two approvals at once: one leader, one invitation, the request approved", async () => {
    const id = await requested(learner);
    const results = await Promise.all([
      as(admin).post(`admin/learning/requests/${id}/approve`, {}),
      as(admin).post(`admin/learning/requests/${id}/approve`, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body?.details).toMatchObject({
      refusal: "not-open",
      status: "approved",
    });
    expect(mailer.sent).toEqual([EMAILS[1]]);
  });

  it("The address changed after the admin opened the request: no leader, stays open, the new address shown", async () => {
    const id = await requested(learner);
    const res = await as(admin).post(`admin/learning/requests/${id}/approve`, {
      email: "an-older-address@example.test",
    });
    expect(res.status).toBe(409);
    expect(res.body?.details).toEqual({
      refusal: "address-changed",
      email: EMAILS[1],
    });
    expect(mailer.sent).toEqual([]);
    expect((await as(learner).get("learning")).body?.request.status).toBe(
      "open",
    );
  });

  it("An address saved with capitals is approved with the address the admin saw", async () => {
    const id = await requested(learner);
    await conn
      .updateTable("user")
      .set({ email: "Requests-Learner@example.test" })
      .where("id", "=", learner.id as never)
      .execute();
    try {
      const listed = (await as(admin).get("admin/learning/requests")).body
        ?.requests[0];
      const res = await as(admin).post(
        `admin/learning/requests/${id}/approve`,
        { email: listed.email },
      );
      expect(res.status).toBe(200);
      expect(mailer.sent).toEqual([EMAILS[1]]);
    } finally {
      await conn
        .updateTable("user")
        .set({ email: EMAILS[1] })
        .where("id", "=", learner.id as never)
        .execute();
    }
  });

  it("Two requests sent at once: one stands, the other is refused", async () => {
    await complete(learner);
    const results = await Promise.all([
      as(learner).post("learning/join-request", { note: "one" }),
      as(learner).post("learning/join-request", { note: "two" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body?.details.refusal).toBe(
      "request-exists",
    );
    const rows = await conn
      .selectFrom("coach_learning_join_requests")
      .select("id")
      .where("user_id", "=", learner.id as never)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it("A request answered while the program is closed keeps its answer when it reopens", async () => {
    const id = await requested(learner);
    await as(admin).post(`admin/learning/modules/${moduleId}/unpublish`);
    expect((await as(learner).get("learning")).body?.open).toBe(false);
    const res = await as(admin).post(`admin/learning/requests/${id}/decline`, {
      reason: "Next term",
    });
    expect(res.status).toBe(200);
    await as(admin).post(`admin/learning/modules/${moduleId}/publish`);
    expect((await as(learner).get("learning")).body?.request).toMatchObject({
      status: "declined",
      reason: "Next term",
    });
  });

  it("Declining with a reason: it leaves the open list and the learner sees the reason", async () => {
    const id = await requested(learner);
    const res = await as(admin).post(`admin/learning/requests/${id}/decline`, {
      reason: "Finish a term first",
    });
    expect(res.body).toEqual({ status: "declined" });
    expect(
      (await as(admin).get("admin/learning/requests")).body?.requests,
    ).toEqual([]);
    expect((await as(learner).get("learning")).body?.request).toMatchObject({
      status: "declined",
      reason: "Finish a term first",
    });
  });

  it("Non-admin tries to answer a request: refused, nothing changes", async () => {
    const id = await requested(learner);
    expect((await as(second).get("admin/learning/requests")).status).toBe(403);
    expect(
      (await as(second).post(`admin/learning/requests/${id}/approve`, {}))
        .status,
    ).toBe(403);
    expect(
      (await as(second).post(`admin/learning/requests/${id}/decline`, {}))
        .status,
    ).toBe(403);
    expect((await as(learner).get("learning")).body?.request.status).toBe(
      "open",
    );
    expect(mailer.sent).toEqual([]);
  });
});

describe("the learners list", () => {
  it("Admin opens the learners list: start date, progress, completion and request state", async () => {
    await requested(learner);
    await as(second).post("learning/enrol");
    const res = await as(admin).get("admin/learning/learners");
    expect(res.body?.total).toBe(2);
    const byEmail = Object.fromEntries(
      res.body?.learners.map((l: { email: string }) => [l.email, l]),
    );
    expect(byEmail[EMAILS[1]]).toMatchObject({
      name: "Ruth Requester",
      passed: 1,
      total: 1,
      request: "open",
    });
    expect(byEmail[EMAILS[1]].completedAt).not.toBeNull();
    expect(byEmail[EMAILS[2]]).toMatchObject({
      passed: 0,
      total: 1,
      completedAt: null,
      request: null,
    });
    expect(byEmail[EMAILS[2]].enrolledAt).toBeString();
  });

  it("A long learners list is paged, and a search by part of an address finds the learner", async () => {
    const extra = Array.from(
      { length: 27 },
      (_, i) => `requests-bulk-${i}@example.test`,
    );
    await conn.deleteFrom("user").where("email", "in", extra).execute();
    const ids = await conn
      .insertInto("user")
      .values(
        extra.map((email) => ({
          email,
          firstName: "Bulk",
          lastName: "Learner",
        })),
      )
      .returning("id")
      .execute();
    await conn
      .insertInto("coach_learning_enrolments")
      .values(ids.map((r) => ({ user_id: r.id as never })))
      .execute();
    await as(learner).post("learning/enrol");
    const page = await as(admin).get("admin/learning/learners");
    expect(page.body?.learners).toHaveLength(25);
    expect(page.body?.total).toBe(28);
    const rest = await as(admin).get("admin/learning/learners?offset=25");
    expect(rest.body?.learners).toHaveLength(3);
    const found = await as(admin).get(
      "admin/learning/learners?q=requests-learn",
    );
    expect(found.body?.learners.map((l: { email: string }) => l.email)).toEqual(
      [EMAILS[1]],
    );
    expect(
      (await as(admin).get("admin/learning/learners?q=100%25")).body?.total,
    ).toBe(0);
    const byName = await as(admin).get("admin/learning/learners?q=ruth%20req");
    expect(
      byName.body?.learners.map((l: { email: string }) => l.email),
    ).toEqual([EMAILS[1]]);
    await conn.deleteFrom("user").where("email", "in", extra).execute();
  });

  it("Non-admin asks for the learners list: refused", async () => {
    expect((await as(learner).get("admin/learning/learners")).status).toBe(403);
  });
});

describe("the program leaves coaching alone", () => {
  it("A leader takes the program: the same /coach/me, sessions and roster entry", async () => {
    await conn
      .insertInto("coach_leaders")
      .values({ slug: "lydia-leader", email: EMAILS[3], name: "Lydia Leader" })
      .execute();
    const before = {
      me: (await as(leader).get("me")).body,
      sessions: (await as(leader).get("reports/summary")).body,
      uploads: await as(leader).get("uploads/classes"),
      roster: (await as(admin).get("admin/coaches")).body?.coaches.find(
        (c: { id: string }) => c.id === "lydia-leader",
      ),
    };
    await complete(leader);
    expect((await as(leader).get("me")).body).toEqual(before.me);
    expect((await as(leader).get("reports/summary")).body).toEqual(
      before.sessions,
    );
    expect(
      (await as(admin).get("admin/coaches")).body?.coaches.find(
        (c: { id: string }) => c.id === "lydia-leader",
      ),
    ).toEqual(before.roster);
    expect(await as(leader).get("uploads/classes")).toEqual(before.uploads);
  });

  it("An enrolled account with an open request deletes itself: gone from the learners list and the open requests", async () => {
    await requested(learner);
    await new AuthService(
      Database,
      redisClient,
      new FakeMailer() as never,
    ).deleteAccount(learner.id);
    expect((await as(admin).get("admin/learning/learners")).body?.total).toBe(
      0,
    );
    expect(
      (await as(admin).get("admin/learning/requests")).body?.requests,
    ).toEqual([]);
    for (const table of [
      "coach_learning_enrolments",
      "coach_learning_lesson_completions",
      "coach_learning_submissions",
      "coach_learning_join_requests",
    ] as const)
      expect(
        await conn
          .selectFrom(table)
          .selectAll()
          .where("user_id", "=", learner.id as never)
          .execute(),
      ).toEqual([]);
  });
});
