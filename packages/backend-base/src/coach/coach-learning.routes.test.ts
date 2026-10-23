import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { sql } from "kysely";

import { coachContract } from "./coach-contract";
import {
  type Account,
  MP4,
  WEBM,
  account,
  caller,
  clearLearning,
  conn,
  dropAccounts,
  learningApp,
  makeAdmin,
  resetLimits,
} from "./coach-learning.fixture";
import { VIDEO_MAX_BYTES } from "./coach-learning.service";

const EMAILS = [
  "learning-admin@example.test",
  "learning-one@example.test",
  "learning-two@example.test",
  "learning-unconfirmed@example.test",
];
const { app, videos, restore } = learningApp();
const call = caller(app);
let admin: Account;
let learner: Account;
let other: Account;

beforeAll(async () => {
  await clearLearning();
  admin = await account(EMAILS[0]);
  learner = await account(EMAILS[1]);
  other = await account(EMAILS[2]);
  await makeAdmin(admin);
});

afterAll(async () => {
  restore();
  await clearLearning();
  await conn
    .deleteFrom("coach_admins")
    .where("email", "=", EMAILS[0])
    .execute();
  await dropAccounts(EMAILS);
});

beforeEach(async () => {
  await resetLimits(admin, learner, other);
  await clearLearning();
  videos.objects.clear();
});

const as = (who: Account) => ({
  get: (p: string) => call(who, "GET", p),
  post: (p: string, b?: unknown) => call(who, "POST", p, b ?? {}),
  put: (p: string, b: unknown) => call(who, "PUT", p, b),
  del: (p: string) => call(who, "DELETE", p),
});

async function module(
  title: string,
  options: {
    lessons?: number;
    questions?: number;
    passMark?: number;
    publish?: boolean;
  } = {},
) {
  const a = as(admin);
  const m = await a.post("admin/learning/modules", {
    title,
    description: `${title} description`,
    passMark: options.passMark ?? 70,
  });
  expect(m.status).toBe(200);
  const lessons: number[] = [];
  for (let i = 1; i <= (options.lessons ?? 2); i++) {
    const l = await a.post(`admin/learning/modules/${m.body?.id}/lessons`, {
      title: `${title} lesson ${i}`,
      body: `Text of ${title} lesson ${i}`,
      passages: [],
    });
    lessons.push(l.body?.id);
    await a.post(`admin/learning/lessons/${l.body?.id}/publish`);
  }
  const questions: number[] = [];
  for (let i = 1; i <= (options.questions ?? 2); i++) {
    const q = await a.post(`admin/learning/modules/${m.body?.id}/questions`, {
      prompt: `${title} question ${i}`,
      options: ["right", "wrong"],
      correct: 0,
    });
    questions.push(q.body?.id);
  }
  if (options.publish ?? true)
    expect(
      (await a.post(`admin/learning/modules/${m.body?.id}/publish`)).status,
    ).toBe(200);
  return { id: m.body?.id as number, lessons, questions };
}

async function pass(who: Account, moduleId: number, right = true) {
  const check = await as(who).get(`learning/modules/${moduleId}/check`);
  return as(who).post(`learning/modules/${moduleId}/check`, {
    version: check.body?.version,
    answers: check.body?.questions.map((q: { id: number }) => ({
      questionId: q.id,
      option: right ? 0 : 1,
    })),
  });
}

async function finishLessons(who: Account, lessons: number[]) {
  for (const l of lessons)
    expect((await as(who).post(`learning/lessons/${l}/done`)).status).toBe(200);
}

describe("authoring", () => {
  it("Publishing a module: learners see it on the path in its position", async () => {
    const first = await module("First");
    const second = await module("Second");
    await as(admin).put("admin/learning/modules/order", {
      ids: [second.id, first.id],
    });
    const state = await as(learner).get("learning");
    expect(state.body?.open).toBe(true);
    expect(state.body?.modules.map((m: { id: number }) => m.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("Publishing an incomplete module is refused with the reason and it stays unpublished", async () => {
    const noLessons = await module("No lessons", {
      lessons: 0,
      publish: false,
    });
    const res = await as(admin).post(
      `admin/learning/modules/${noLessons.id}/publish`,
    );
    expect(res.status).toBe(409);
    expect(res.body?.details.refusal).toBe("incomplete-module");
    expect(res.body?.message).toContain("lesson");
    const noQuestions = await module("No questions", {
      questions: 0,
      publish: false,
    });
    const res2 = await as(admin).post(
      `admin/learning/modules/${noQuestions.id}/publish`,
    );
    expect(res2.body?.message).toContain("question");
    expect((await as(learner).get("learning")).body?.open).toBe(false);
  });

  it("Invalid check question: fewer than two options, more than six, or not exactly one correct", async () => {
    const m = await module("Questions", { publish: false });
    for (const body of [
      { prompt: "Q", options: ["only"], correct: 0 },
      { prompt: "Q", options: ["1", "2", "3", "4", "5", "6", "7"], correct: 0 },
      { prompt: "Q", options: ["a", "b"], correct: 2 },
      { prompt: "Q", options: ["a", "b"], correct: -1 },
    ]) {
      const res = await as(admin).post(
        `admin/learning/modules/${m.id}/questions`,
        body,
      );
      expect(res.status).toBe(400);
      expect(res.body?.details.refusal).toBe("invalid-question");
    }
  });

  it("Invalid passage: no such book or chapter, a verse past the end, or a range ending before it starts", async () => {
    const m = await module("Passages", { publish: false });
    const save = (passages: unknown[]) =>
      as(admin).put(`admin/learning/lessons/${m.lessons[0]}`, {
        title: "L",
        body: "",
        passages,
      });
    for (const passage of [
      { bookId: 99, chapter: 1 },
      { bookId: 43, chapter: 22 },
      { bookId: 43, chapter: 3, verseStart: 37 },
      { bookId: 43, chapter: 3, verseStart: 16, verseEnd: 10 },
    ]) {
      const res = await save([passage]);
      expect(res.status).toBe(400);
      expect(res.body?.details.refusal).toBe("invalid-passage");
    }
    expect(
      (await save([{ bookId: 43, chapter: 3, verseStart: 16, verseEnd: 18 }]))
        .status,
    ).toBe(200);
    const preview = await as(admin).get(
      `admin/learning/lessons/${m.lessons[0]}`,
    );
    expect(preview.body?.passages).toEqual([
      {
        bookId: 43,
        bookName: "John",
        chapter: 3,
        verseStart: 16,
        verseEnd: 18,
      },
    ]);
  });

  it("Emptying a published module is refused until the module is unpublished", async () => {
    const m = await module("Thin", { lessons: 1, questions: 1 });
    for (const res of [
      await as(admin).post(`admin/learning/lessons/${m.lessons[0]}/unpublish`),
      await as(admin).del(`admin/learning/lessons/${m.lessons[0]}`),
      await as(admin).del(`admin/learning/questions/${m.questions[0]}`),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body?.details.refusal).toBe("module-would-empty");
    }
    await as(admin).post(`admin/learning/modules/${m.id}/unpublish`);
    expect(
      (await as(admin).del(`admin/learning/questions/${m.questions[0]}`))
        .status,
    ).toBe(200);
  });

  it("Deleting content a learner has used is refused and offers to unpublish", async () => {
    const m = await module("Used", { lessons: 2 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    await pass(learner, m.id, false);
    const lesson = await as(admin).del(
      `admin/learning/lessons/${m.lessons[0]}`,
    );
    expect(lesson.status).toBe(409);
    expect(lesson.body?.details.refusal).toBe("in-use");
    expect(lesson.body?.message).toContain("Unpublish");
    const mod = await as(admin).del(`admin/learning/modules/${m.id}`);
    expect(mod.body?.details.refusal).toBe("in-use");
    const tree = await as(admin).get("admin/learning");
    expect(tree.body?.modules[0].used).toBe(true);
    expect(tree.body?.modules[0].lessons[0].used).toBe(true);
  });

  it("Deleting a module whose lessons were marked done, with no check taken, is refused", async () => {
    const m = await module("Read", { lessons: 1 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    const res = await as(admin).del(`admin/learning/modules/${m.id}`);
    expect(res.status).toBe(409);
    expect(res.body?.details.refusal).toBe("in-use");
  });

  it("Deleting an unused module deletes its lessons and their video files", async () => {
    const m = await module("Unused", { lessons: 1, publish: false });
    await as(admin).post(
      `admin/learning/lessons/${m.lessons[0]}/video/upload`,
      {
        size: MP4.byteLength,
        type: "video/mp4",
      },
    );
    const key = videos.signed.at(-1)?.key as string;
    videos.objects.set(key, MP4);
    await as(admin).post(`admin/learning/lessons/${m.lessons[0]}/video/attach`);
    expect((await as(admin).del(`admin/learning/modules/${m.id}`)).status).toBe(
      200,
    );
    expect(videos.objects.has(key)).toBe(false);
    expect(
      await conn
        .selectFrom("coach_learning_lessons")
        .select("id")
        .where("module_id", "=", m.id)
        .execute(),
    ).toEqual([]);
  });

  it("Previewing a draft: the admin reads it marked as a draft, no learner can open it", async () => {
    const m = await module("Draft", { publish: false });
    const preview = await as(admin).get(
      `admin/learning/lessons/${m.lessons[0]}`,
    );
    expect(preview.body?.draft).toBe(true);
    expect(preview.body?.body).toContain("Text of Draft");
    await module("Live");
    await as(learner).post("learning/enrol");
    const res = await as(learner).get(`learning/lessons/${m.lessons[0]}`);
    expect(res.status).toBe(404);
    expect(res.raw).not.toContain("Text of Draft");
  });

  it("Every admin learning route in the contract refuses a signed-in non-admin", async () => {
    const m = await module("Swept", { publish: false });
    const routes = coachContract()
      .routes.map((r) => r.route)
      .filter((r) => r.split(" ")[1].startsWith("/coach/admin/learning"));
    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) {
      const [method, path] = route.split(" ");
      const res = await call(
        learner,
        method as "GET",
        path.replace("/coach/", "").replace(":id", String(m.id)),
        method === "GET" ? undefined : {},
      );
      expect([route, res.status]).toEqual([route, 403]);
    }
  });

  it("A non-admin over the limit is slowed down before the admin check", async () => {
    let last = 0;
    for (let i = 0; i < 121; i++)
      last = (await as(other).get("admin/learning")).status;
    expect(last).toBe(429);
  });

  it("Non-admin tries to author: every authoring route is refused and nothing changes", async () => {
    const m = await module("Guarded", { publish: false });
    const tries = [
      ["GET", "admin/learning"],
      [
        "POST",
        "admin/learning/modules",
        { title: "x", description: "", passMark: 50 },
      ],
      [
        "PUT",
        `admin/learning/modules/${m.id}`,
        { title: "x", description: "", passMark: 50 },
      ],
      ["POST", `admin/learning/modules/${m.id}/publish`],
      ["DELETE", `admin/learning/modules/${m.id}`],
      ["GET", `admin/learning/lessons/${m.lessons[0]}`],
      [
        "POST",
        `admin/learning/lessons/${m.lessons[0]}/video/upload`,
        { size: 10, type: "video/mp4" },
      ],
      ["GET", "admin/learning/requests"],
      ["GET", "admin/learning/learners"],
    ] as const;
    for (const [method, path, body] of tries) {
      const res = await call(
        learner,
        method,
        path,
        body ?? (method === "POST" ? {} : undefined),
      );
      expect(res.status).toBe(403);
    }
    const row = await conn
      .selectFrom("coach_learning_modules")
      .select(["title", "published"])
      .where("id", "=", m.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ title: "Guarded", published: false });
  });
});

describe("the path", () => {
  it("Signed-out visitor opens a program link: asked to sign in, no content", async () => {
    const m = await module("Open");
    for (const path of [
      "learning",
      `learning/lessons/${m.lessons[0]}`,
      `learning/modules/${m.id}/check`,
    ]) {
      const res = await call(null, "GET", path);
      expect(res.status).toBe(401);
      expect(res.raw).not.toContain("Text of");
    }
  });

  it("A signed-in account that has not started the program reads no lesson, video or check", async () => {
    const m = await module("Closed door", { lessons: 1 });
    for (const path of [
      `learning/lessons/${m.lessons[0]}`,
      `learning/lessons/${m.lessons[0]}/video`,
      `learning/modules/${m.id}/check`,
    ]) {
      const res = await as(other).get(path);
      expect(res.status).toBe(403);
      expect(res.body?.details.refusal).toBe("not-enrolled");
    }
  });

  it("Program with nothing published: not open, nothing can be started", async () => {
    await module("Hidden", { publish: false });
    const state = await as(learner).get("learning");
    expect(state.body?.open).toBe(false);
    expect(state.body?.modules).toEqual([]);
    const enrol = await as(learner).post("learning/enrol");
    expect(enrol.body?.details.refusal).toBe("not-open");
  });

  it("A newcomer starts the program: enrolled today and pointed at the first lesson", async () => {
    const m = await module("Start");
    const before = await as(other).get("learning");
    expect(before.body?.enrolledAt).toBeNull();
    const res = await as(other).post("learning/enrol");
    expect(res.status).toBe(200);
    expect(res.body?.enrolledAt.slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10),
    );
    expect(res.body?.next).toEqual({
      kind: "lesson",
      lessonId: m.lessons[0],
      moduleId: m.id,
    });
  });

  it("Where to continue: two lessons done points at the third, zero modules passed", async () => {
    const m = await module("Three", { lessons: 3 });
    await module("After");
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons.slice(0, 2));
    const state = await as(learner).get("learning");
    expect(state.body?.next).toEqual({
      kind: "lesson",
      lessonId: m.lessons[2],
      moduleId: m.id,
    });
    expect(state.body?.passed).toBe(0);
    expect(state.body?.total).toBe(2);
  });

  it("A locked lesson is not shown: the learner sees it is locked and which step comes first", async () => {
    const m = await module("Locked", { lessons: 2 });
    await as(learner).post("learning/enrol");
    const res = await as(learner).get(`learning/lessons/${m.lessons[1]}`);
    expect(res.status).toBe(403);
    expect(res.body?.details).toEqual({
      refusal: "locked",
      next: { kind: "lesson", lessonId: m.lessons[0], moduleId: m.id },
    });
    expect(res.raw).not.toContain("Text of Locked lesson 2");
    const done = await as(learner).post(
      `learning/lessons/${m.lessons[1]}/done`,
    );
    expect(done.status).toBe(403);
  });

  it("The check opens after the last lesson, and the next module stays locked until it is passed", async () => {
    const m = await module("Gate", { lessons: 2 });
    const next = await module("Behind");
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons.slice(0, 1));
    expect(
      (await as(learner).get(`learning/modules/${m.id}/check`)).status,
    ).toBe(403);
    const after = await as(learner).post(
      `learning/lessons/${m.lessons[1]}/done`,
    );
    expect(after.body?.modules[0].state).toBe("open");
    expect(after.body?.next).toEqual({ kind: "check", moduleId: m.id });
    expect(after.body?.modules[1].lessons[0].state).toBe("locked");
    expect(
      (await as(learner).get(`learning/lessons/${next.lessons[0]}`)).status,
    ).toBe(403);
  });

  it("Check before the lessons are done: the submission is refused and nothing is recorded", async () => {
    const m = await module("Early");
    await as(learner).post("learning/enrol");
    const res = await as(learner).post(`learning/modules/${m.id}/check`, {
      version: 1,
      answers: m.questions.map((q) => ({ questionId: q, option: 0 })),
    });
    expect(res.status).toBe(403);
    const subs = await conn
      .selectFrom("coach_learning_submissions")
      .selectAll()
      .execute();
    expect(subs).toEqual([]);
  });

  it("A lesson inserted ahead of done lessons: they stay open and the path points at the new one", async () => {
    const m = await module("Insert", { lessons: 2 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    const fresh = await as(admin).post(
      `admin/learning/modules/${m.id}/lessons`,
      {
        title: "New first",
        body: "",
        passages: [],
      },
    );
    await as(admin).put(`admin/learning/modules/${m.id}/lessons/order`, {
      ids: [fresh.body?.id, ...m.lessons],
    });
    await as(admin).post(`admin/learning/lessons/${fresh.body?.id}/publish`);
    const state = await as(learner).get("learning");
    expect(
      state.body?.modules[0].lessons.map((l: { state: string }) => l.state),
    ).toEqual(["open", "done", "done"]);
    expect(state.body?.next).toEqual({
      kind: "lesson",
      lessonId: fresh.body?.id,
      moduleId: m.id,
    });
    expect(
      (await as(learner).get(`learning/lessons/${m.lessons[1]}`)).status,
    ).toBe(200);
  });

  it("A module published ahead of the learner's module: done lessons stay open, the rest locks", async () => {
    const m = await module("Current", { lessons: 3 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons.slice(0, 1));
    const ahead = await module("Ahead");
    await as(admin).put("admin/learning/modules/order", {
      ids: [ahead.id, m.id],
    });
    const state = await as(learner).get("learning");
    expect(
      state.body?.modules[1].lessons.map((l: { state: string }) => l.state),
    ).toEqual(["done", "locked", "locked"]);
    expect(state.body?.next).toEqual({
      kind: "lesson",
      lessonId: ahead.lessons[0],
      moduleId: ahead.id,
    });
    expect(
      (await as(learner).get(`learning/lessons/${m.lessons[0]}`)).status,
    ).toBe(200);
  });

  it("Marking a lesson done shows it done and opens the next step", async () => {
    const m = await module("Mark", { lessons: 2 });
    await as(learner).post("learning/enrol");
    const res = await as(learner).post(`learning/lessons/${m.lessons[0]}/done`);
    expect(
      res.body?.modules[0].lessons.map((l: { state: string }) => l.state),
    ).toEqual(["done", "open"]);
    const lesson = await as(learner).get(`learning/lessons/${m.lessons[0]}`);
    expect(lesson.body?.done).toBe(true);
  });

  it("A lesson added to a module the learner is in holds back the check", async () => {
    const m = await module("Grow", { lessons: 1 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    const extra = await as(admin).post(
      `admin/learning/modules/${m.id}/lessons`,
      {
        title: "Extra",
        body: "",
        passages: [],
      },
    );
    await as(admin).post(`admin/learning/lessons/${extra.body?.id}/publish`);
    expect(
      (await as(learner).get(`learning/modules/${m.id}/check`)).status,
    ).toBe(403);
  });

  it("A lesson added to a passed module: the module stays passed, the new lesson blocks nothing", async () => {
    const m = await module("Passed", { lessons: 1 });
    const next = await module("Next");
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    expect((await pass(learner, m.id)).body?.passed).toBe(true);
    const extra = await as(admin).post(
      `admin/learning/modules/${m.id}/lessons`,
      {
        title: "Extra",
        body: "",
        passages: [],
      },
    );
    await as(admin).post(`admin/learning/lessons/${extra.body?.id}/publish`);
    const state = await as(learner).get("learning");
    expect(state.body?.modules[0].state).toBe("passed");
    expect(state.body?.modules[0].lessons[1].state).toBe("open");
    expect(state.body?.modules[1].lessons[0].state).toBe("open");
    expect(
      (await as(learner).get(`learning/lessons/${next.lessons[0]}`)).status,
    ).toBe(200);
  });

  it("A passed module keeps all its lessons open, even behind a module published ahead of it", async () => {
    const m = await module("Kept open", { lessons: 1 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    await pass(learner, m.id);
    const extra = await as(admin).post(
      `admin/learning/modules/${m.id}/lessons`,
      {
        title: "Late lesson",
        body: "",
        passages: [],
      },
    );
    await as(admin).post(`admin/learning/lessons/${extra.body?.id}/publish`);
    const ahead = await module("Ahead of a pass");
    await as(admin).put("admin/learning/modules/order", {
      ids: [ahead.id, m.id],
    });
    const state = await as(learner).get("learning");
    expect(state.body?.modules[1].lessons[1]).toMatchObject({
      id: extra.body?.id,
      state: "open",
    });
    expect(
      (await as(learner).get(`learning/lessons/${extra.body?.id}`)).status,
    ).toBe(200);
  });

  it("Records survive a closed program and show again once it reopens", async () => {
    const m = await module("Only", { lessons: 1 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    await pass(learner, m.id);
    const completed = (await as(learner).get("learning")).body?.completedAt;
    expect(completed).not.toBeNull();
    await as(admin).post(`admin/learning/modules/${m.id}/unpublish`);
    const closed = await as(learner).get("learning");
    expect(closed.body?.open).toBe(false);
    expect(closed.body?.completedAt).toBe(completed);
    expect(
      (await as(admin).get("admin/learning/learners")).body?.learners[0]
        .completedAt,
    ).toBe(completed);
    await as(admin).post(`admin/learning/modules/${m.id}/publish`);
    const reopened = await as(learner).get("learning");
    expect(reopened.body?.open).toBe(true);
    expect(reopened.body?.completedAt).toBe(completed);
  });
});

describe("checks", () => {
  async function ready(passMark = 70, questions = 2) {
    const m = await module("Check", { lessons: 1, questions, passMark });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, m.lessons);
    return m;
  }

  it("Correct options stay on the server", async () => {
    const m = await ready();
    const res = await as(learner).get(`learning/modules/${m.id}/check`);
    expect(res.status).toBe(200);
    expect(res.body?.questions[0]).toEqual({
      id: m.questions[0],
      prompt: "Check question 1",
      options: ["right", "wrong"],
    });
    expect(res.raw).not.toContain("correct");
    expect((await as(learner).get("admin/learning")).status).toBe(403);
  });

  it("Passing the check passes the module, shows the score and opens the next module", async () => {
    const m = await ready();
    const next = await module("Then");
    const res = await pass(learner, m.id);
    expect(res.body).toMatchObject({
      score: 100,
      passed: true,
      wrong: [],
      modulePassed: true,
    });
    expect(
      (await as(learner).get(`learning/lessons/${next.lessons[0]}`)).status,
    ).toBe(200);
  });

  it("Failing, then retaking: the first shows the wrong questions, the second passes with the best kept", async () => {
    const m = await ready();
    const first = await pass(learner, m.id, false);
    expect(first.body).toMatchObject({
      score: 0,
      passed: false,
      wrong: [1, 2],
      modulePassed: false,
    });
    expect((await as(learner).get("learning")).body?.modules[0].state).toBe(
      "open",
    );
    const second = await pass(learner, m.id);
    expect(second.body).toMatchObject({
      passed: true,
      bestScore: 100,
      modulePassed: true,
    });
    await pass(learner, m.id, false);
    const state = await as(learner).get("learning");
    expect(state.body?.modules[0]).toMatchObject({
      state: "passed",
      bestScore: 100,
    });
  });

  it("Pass mark compared without rounding: 2 of 3 fails at 67 and passes at 66", async () => {
    for (const [mark, expected] of [
      [67, false],
      [66, true],
    ] as const) {
      await clearLearning();
      const m = await ready(mark, 3);
      const check = await as(learner).get(`learning/modules/${m.id}/check`);
      const res = await as(learner).post(`learning/modules/${m.id}/check`, {
        version: check.body?.version,
        answers: check.body?.questions.map((q: { id: number }, i: number) => ({
          questionId: q.id,
          option: i < 2 ? 0 : 1,
        })),
      });
      expect(res.body?.score).toBe(66.67);
      expect(res.body?.passed).toBe(expected);
    }
  });

  for (const [what, answers] of [
    [
      "the same question twice",
      (q: number[]) =>
        [q[0], q[0]].map((id) => ({ questionId: id, option: 0 })),
    ],
    [
      "a question from elsewhere",
      (q: number[]) =>
        [q[0], 2147483647].map((id) => ({ questionId: id, option: 0 })),
    ],
    [
      "an option past the last",
      (q: number[]) => q.map((id) => ({ questionId: id, option: 9 })),
    ],
  ] as const)
    it(`A submission with ${what} is refused uncounted`, async () => {
      const m = await ready();
      const check = await as(learner).get(`learning/modules/${m.id}/check`);
      const res = await as(learner).post(`learning/modules/${m.id}/check`, {
        version: check.body?.version,
        answers: answers(m.questions),
      });
      expect(res.status).toBe(400);
      expect(
        await conn
          .selectFrom("coach_learning_submissions")
          .selectAll()
          .execute(),
      ).toEqual([]);
    });

  it("An eleventh check submission in a minute is slowed down and not counted", async () => {
    const m = await ready();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await pass(learner, m.id, false)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(
      await conn.selectFrom("coach_learning_submissions").selectAll().execute(),
    ).toHaveLength(10);
  });

  it("Incomplete submission: refused, nothing graded, not counted", async () => {
    const m = await ready();
    const check = await as(learner).get(`learning/modules/${m.id}/check`);
    const res = await as(learner).post(`learning/modules/${m.id}/check`, {
      version: check.body?.version,
      answers: [{ questionId: m.questions[0], option: 0 }],
    });
    expect(res.status).toBe(400);
    expect(res.body?.details.refusal).toBe("incomplete");
    expect(
      await conn.selectFrom("coach_learning_submissions").selectAll().execute(),
    ).toEqual([]);
  });

  it("A check changed while it was being answered is refused uncounted and the current check is shown", async () => {
    const m = await ready();
    const opened = await as(learner).get(`learning/modules/${m.id}/check`);
    await as(admin).put(`admin/learning/questions/${m.questions[1]}`, {
      prompt: "Reworded",
      options: ["right", "wrong", "maybe"],
      correct: 0,
    });
    const res = await as(learner).post(`learning/modules/${m.id}/check`, {
      version: opened.body?.version,
      answers: m.questions.map((q) => ({ questionId: q, option: 0 })),
    });
    expect(res.status).toBe(409);
    expect(res.body?.details.refusal).toBe("check-changed");
    expect(
      await conn.selectFrom("coach_learning_submissions").selectAll().execute(),
    ).toEqual([]);
    const now = await as(learner).get(`learning/modules/${m.id}/check`);
    expect(now.body?.questions[1].prompt).toBe("Reworded");
    expect(now.body?.version).toBeGreaterThan(opened.body?.version);
  });

  it("A submission landing while a question edit waits on its version bump is graded on the questions the learner was shown", async () => {
    const m = await ready();
    const opened = await as(learner).get(`learning/modules/${m.id}/check`);
    let release = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    let locked = () => {};
    const isLocked = new Promise<void>((r) => {
      locked = r;
    });
    const lock = conn.transaction().execute(async (trx) => {
      await trx
        .selectFrom("coach_learning_modules")
        .select("id")
        .where("id", "=", m.id)
        .forNoKeyUpdate()
        .execute();
      locked();
      await held;
    });
    await isLocked;
    const edit = as(admin).put(`admin/learning/questions/${m.questions[1]}`, {
      prompt: "Answer key changed",
      options: ["right", "wrong"],
      correct: 1,
    });
    for (let waited = 0; ; waited += 20) {
      const waiting = await sql<{ n: number }>`
        select count(*)::int as n from pg_stat_activity
        where wait_event_type = 'Lock' and datname = current_database()`.execute(
        conn,
      );
      if (waiting.rows[0].n > 0) break;
      if (waited > 5000) throw new Error("the edit never reached the bump");
      await Bun.sleep(20);
    }
    const res = await as(learner).post(`learning/modules/${m.id}/check`, {
      version: opened.body?.version,
      answers: m.questions.map((q) => ({ questionId: q, option: 0 })),
    });
    release();
    await lock;
    expect((await edit).status).toBe(200);
    if (res.status === 200) expect(res.body?.correct).toBe(2);
    else expect(res.body?.details.refusal).toBe("check-changed");
  });

  for (const [change, edit] of [
    [
      "a question added",
      (m: { id: number }) =>
        as(admin).post(`admin/learning/modules/${m.id}/questions`, {
          prompt: "Added",
          options: ["right", "wrong"],
          correct: 0,
        }),
    ],
    [
      "a question deleted",
      (m: { questions: number[] }) =>
        as(admin).del(`admin/learning/questions/${m.questions[1]}`),
    ],
    [
      "the questions reordered",
      (m: { id: number; questions: number[] }) =>
        as(admin).put(`admin/learning/modules/${m.id}/questions/order`, {
          ids: [...m.questions].reverse(),
        }),
    ],
  ] as const)
    it(`A check changed by ${change} while it was being answered is refused uncounted`, async () => {
      const m = await ready();
      const opened = await as(learner).get(`learning/modules/${m.id}/check`);
      expect((await edit(m)).status).toBe(200);
      const res = await as(learner).post(`learning/modules/${m.id}/check`, {
        version: opened.body?.version,
        answers: m.questions.map((q) => ({ questionId: q, option: 0 })),
      });
      expect(res.status).toBe(409);
      expect(res.body?.details.refusal).toBe("check-changed");
      expect(
        await conn
          .selectFrom("coach_learning_submissions")
          .selectAll()
          .execute(),
      ).toEqual([]);
    });

  it("A check edited after a pass: the module stays passed and the best score is unchanged", async () => {
    const m = await ready();
    await pass(learner, m.id);
    await as(admin).put(`admin/learning/modules/${m.id}`, {
      title: "Check",
      description: "",
      passMark: 100,
    });
    await as(admin).put(`admin/learning/questions/${m.questions[0]}`, {
      prompt: "Changed",
      options: ["a", "b"],
      correct: 1,
    });
    const state = await as(learner).get("learning");
    expect(state.body?.modules[0]).toMatchObject({
      state: "passed",
      bestScore: 100,
    });
  });
});

describe("completion", () => {
  it("Completing the program: completed today, each module's best score", async () => {
    const one = await module("One", { lessons: 1 });
    const two = await module("Two", { lessons: 1 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, one.lessons);
    await pass(learner, one.id);
    expect((await as(learner).get("learning")).body?.completedAt).toBeNull();
    await finishLessons(learner, two.lessons);
    await pass(learner, two.id);
    const state = await as(learner).get("learning");
    expect(state.body?.completedAt.slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10),
    );
    expect(
      state.body?.modules.map((m: { bestScore: number }) => m.bestScore),
    ).toEqual([100, 100]);
    expect(state.body?.next).toBeNull();
  });

  it("A module added after completion: the completion stands and the new module is open, not yet taken", async () => {
    const one = await module("One", { lessons: 1 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, one.lessons);
    await pass(learner, one.id);
    const completed = (await as(learner).get("learning")).body?.completedAt;
    const later = await module("Later");
    const state = await as(learner).get("learning");
    expect(state.body?.completedAt).toBe(completed);
    expect(state.body?.modules[1]).toMatchObject({
      id: later.id,
      bestScore: null,
    });
    expect(state.body?.modules[1].lessons[0].state).toBe("open");
  });

  it("Completion after a module is unpublished: completed when next evaluated, listing what is still published", async () => {
    const one = await module("Kept", { lessons: 1 });
    const two = await module("Dropped", { lessons: 1 });
    await as(learner).post("learning/enrol");
    await finishLessons(learner, one.lessons);
    await pass(learner, one.id);
    await as(admin).post(`admin/learning/modules/${two.id}/unpublish`);
    const yesterday = new Date(Date.now() - 86_400_000);
    await conn
      .updateTable("coach_learning_enrolments")
      .set({ enrolled_at: yesterday })
      .execute();
    await conn
      .updateTable("coach_learning_submissions")
      .set({ submitted_at: yesterday })
      .execute();
    await conn
      .updateTable("coach_learning_lesson_completions")
      .set({ done_at: yesterday })
      .execute();
    const state = await as(learner).get("learning");
    expect(state.body?.completedAt.slice(0, 10)).toBe(
      new Date().toISOString().slice(0, 10),
    );
    expect(state.body?.modules.map((m: { title: string }) => m.title)).toEqual([
      "Kept",
    ]);
  });
});

describe("lesson videos", () => {
  async function withVideo(bytes: Uint8Array, type = "video/mp4") {
    const m = await module("Video", { lessons: 1 });
    const lesson = m.lessons[0];
    const up = await as(admin).post(
      `admin/learning/lessons/${lesson}/video/upload`,
      {
        size: bytes.byteLength,
        type,
      },
    );
    expect(up.status).toBe(200);
    const key = videos.signed.at(-1)?.key as string;
    expect(videos.signed.at(-1)?.contentLength).toBe(bytes.byteLength);
    expect(videos.signed.at(-1)?.contentType).toBe(type);
    videos.objects.set(key, bytes);
    return {
      m,
      lesson,
      key,
      attach: () =>
        as(admin).post(`admin/learning/lessons/${lesson}/video/attach`),
    };
  }

  it("Learner watches a lesson video: a one-hour address for that one video", async () => {
    const { attach, lesson, key } = await withVideo(MP4);
    expect((await attach()).body).toEqual({ type: "video/mp4" });
    await as(learner).post("learning/enrol");
    const res = await as(learner).get(`learning/lessons/${lesson}/video`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      url: `https://store.example.test/${key}?get&ttl=3600`,
      type: "video/mp4",
      expiresInSeconds: 3600,
    });
    expect(
      (await as(learner).get(`learning/lessons/${lesson}`)).body?.hasVideo,
    ).toBe(true);
  });

  it("Video of a locked or draft lesson: refused, no address issued", async () => {
    const { attach } = await withVideo(WEBM, "video/webm");
    await attach();
    const locked = await module("Locked video", { lessons: 2 });
    const draft = await module("Draft video", { lessons: 1, publish: false });
    for (const l of [locked.lessons[1], draft.lessons[0]]) {
      const up = await as(admin).post(
        `admin/learning/lessons/${l}/video/upload`,
        { size: MP4.byteLength, type: "video/mp4" },
      );
      expect(up.status).toBe(200);
      videos.objects.set(videos.signed.at(-1)?.key as string, MP4);
      await as(admin).post(`admin/learning/lessons/${l}/video/attach`);
    }
    await as(learner).post("learning/enrol");
    for (const l of [locked.lessons[1], draft.lessons[0]]) {
      const res = await as(learner).get(`learning/lessons/${l}/video`);
      expect([403, 404]).toContain(res.status);
      expect(res.raw).not.toContain("store.example.test");
    }
    expect(
      (await as(admin).get(`learning/lessons/${draft.lessons[0]}/video`))
        .status,
    ).toBe(200);
  });

  it("Wrong format or too large: refused with the reason, the lesson keeps its previous video", async () => {
    const { attach, lesson, key } = await withVideo(MP4);
    await attach();
    const big = await as(admin).post(
      `admin/learning/lessons/${lesson}/video/upload`,
      {
        size: VIDEO_MAX_BYTES + 1,
        type: "video/mp4",
      },
    );
    expect(big.status).toBe(400);
    expect(big.body?.message).toContain("2 GB");
    const mov = await as(admin).post(
      `admin/learning/lessons/${lesson}/video/upload`,
      {
        size: 10,
        type: "video/quicktime",
      },
    );
    expect(mov.body?.details.refusal).toBe("video-refused");
    await as(admin).post(`admin/learning/lessons/${lesson}/video/upload`, {
      size: 12,
      type: "video/mp4",
    });
    const pending = videos.signed.at(-1)?.key as string;
    videos.objects.set(pending, new TextEncoder().encode("not a video!"));
    const res = await attach();
    expect(res.status).toBe(400);
    expect(res.body?.message).toContain("not an MP4 or WebM");
    expect(videos.objects.has(pending)).toBe(false);
    videos.objects.set(pending, MP4);
    videos.sizes.set(pending, VIDEO_MAX_BYTES + 1);
    expect((await attach()).body?.message).toContain("2 GB");
    const tree = await as(admin).get("admin/learning");
    expect(tree.body?.modules[0].lessons[0]).toMatchObject({
      hasVideo: true,
      videoType: "video/mp4",
    });
    expect(videos.objects.has(key)).toBe(true);
  });

  it("Interrupted upload: the lesson keeps its previous video or none", async () => {
    const m = await module("Interrupted", { lessons: 1 });
    await as(admin).post(
      `admin/learning/lessons/${m.lessons[0]}/video/upload`,
      { size: 100, type: "video/mp4" },
    );
    const res = await as(admin).post(
      `admin/learning/lessons/${m.lessons[0]}/video/attach`,
    );
    expect(res.status).toBe(409);
    expect(res.body?.details.refusal).toBe("no-upload");
    await as(learner).post("learning/enrol");
    expect(
      (await as(learner).get(`learning/lessons/${m.lessons[0]}`)).body
        ?.hasVideo,
    ).toBe(false);
  });

  it("Interrupted replacement: the lesson keeps the video it had", async () => {
    const { attach, lesson, key } = await withVideo(MP4);
    await attach();
    await as(admin).post(`admin/learning/lessons/${lesson}/video/upload`, {
      size: WEBM.byteLength,
      type: "video/webm",
    });
    const res = await attach();
    expect(res.body?.details.refusal).toBe("no-upload");
    await as(learner).post("learning/enrol");
    const video = await as(learner).get(`learning/lessons/${lesson}/video`);
    expect(video.body?.url).toContain(key);
    expect(video.body?.type).toBe("video/mp4");
  });

  it("Replacing a video: learners get the new one and the old file is deleted", async () => {
    const { attach, lesson, key } = await withVideo(MP4);
    await attach();
    await as(admin).post(`admin/learning/lessons/${lesson}/video/upload`, {
      size: WEBM.byteLength,
      type: "video/webm",
    });
    const second = videos.signed.at(-1)?.key as string;
    expect(second).not.toBe(key);
    videos.objects.set(second, WEBM);
    expect((await attach()).body).toEqual({ type: "video/webm" });
    expect(videos.objects.has(key)).toBe(false);
    await as(learner).post("learning/enrol");
    const res = await as(learner).get(`learning/lessons/${lesson}/video`);
    expect(res.body?.url).toContain(second);
    expect(res.body?.type).toBe("video/webm");
  });

  it("Removing a video: the file is deleted and learners get no address", async () => {
    const { attach, lesson, key } = await withVideo(MP4);
    await attach();
    expect(
      (await as(admin).del(`admin/learning/lessons/${lesson}/video`)).status,
    ).toBe(200);
    expect(videos.objects.has(key)).toBe(false);
    await as(learner).post("learning/enrol");
    expect(
      (await as(learner).get(`learning/lessons/${lesson}`)).body?.hasVideo,
    ).toBe(false);
    expect(
      (await as(learner).get(`learning/lessons/${lesson}/video`)).status,
    ).toBe(404);
  });

  it("Deleting a lesson deletes its video file", async () => {
    const { attach, m, key } = await withVideo(MP4);
    await attach();
    await as(admin).post(`admin/learning/modules/${m.id}/unpublish`);
    expect(
      (await as(admin).del(`admin/learning/lessons/${m.lessons[0]}`)).status,
    ).toBe(200);
    expect(videos.objects.has(key)).toBe(false);
  });
});
