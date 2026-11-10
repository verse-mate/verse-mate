import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db as Database } from "database";
import { sql } from "kysely";

import {
  FIXTURE_ADMIN,
  FIXTURE_LEADERS,
  FIXTURE_MONTH,
  FIXTURE_REPORTS,
  clearCoachFixture,
  seedCoachFixture,
} from "../coach/coach-fixture";
import { clearLearning } from "../coach/coach-learning.fixture";
import { CoachMonthlyService } from "../coach/coach-monthly.service";
import { isolateTable } from "../coach/coach-test-tables";
import { DIMENSIONS } from "../coach/rubric";
import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import { createTestUser } from "../shared/test-helpers";
import { contractApp } from "./contract-app";

const PAYLOADS = join(import.meta.dir, "payloads");
const CAPTURE = process.env.CONTRACT_CAPTURE === "1";
const STUDY = JSON.parse(
  readFileSync(join(import.meta.dir, "inputs", "study-james-1.json"), "utf8"),
);

const conn = Database.getOrCreateConnection();
isolateTable("coach_admins");
isolateTable("coach_monthly_reports");

const app = contractApp();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/;
const TOKEN = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const VOLATILE_KEYS = new Set([
  "auto_highlight_id",
  "highlight_id",
  "merged_highlight_ids",
  "retryAfter",
  "edit",
]);

function normalise(value: unknown, volatile: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => normalise(v, volatile));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        volatile.has(k) && v !== null ? `<${k}>` : normalise(v, volatile),
      ]),
    );
  if (typeof value === "string") {
    if (UUID.test(value)) return "<uuid>";
    if (DATE_TIME.test(value)) return "<date-time>";
    if (TOKEN.test(value)) return "<token>";
  }
  return value;
}

async function call(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body: parsed as any };
}

function matchesFixture(
  name: string,
  response: { status: number; body: unknown },
  extraVolatile: string[] = [],
) {
  const volatile = new Set([...VOLATILE_KEYS, ...extraVolatile]);
  const actual = normalise(response, volatile);
  const path = join(PAYLOADS, `${name}.json`);
  if (CAPTURE) {
    mkdirSync(PAYLOADS, { recursive: true });
    writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  if (!existsSync(path))
    throw new Error(
      `no captured payload for ${name}: capture it with CONTRACT_CAPTURE=1`,
    );
  expect(actual).toEqual(JSON.parse(readFileSync(path, "utf8")));
}

const EMAILS = {
  reader: "contract-reader@example.test",
  unconfirmed: "contract-unconfirmed@example.test",
  deleter: "contract-deleter@example.test",
  learner: "contract-learner@example.test",
  locked: "contract-locked@example.test",
  leader: FIXTURE_LEADERS[0].email,
  admin: FIXTURE_ADMIN,
};

type Login = Awaited<ReturnType<typeof createTestUser>>;
const logins = {} as Record<keyof typeof EMAILS, Login>;

async function login(
  key: keyof typeof EMAILS,
  options: { confirmed?: boolean; firstName: string; lastName: string },
) {
  const email = EMAILS[key];
  await conn.deleteFrom("user").where("email", "=", email).execute();
  const user = await createTestUser({ email });
  await conn
    .updateTable("user")
    .set({
      firstName: options.firstName,
      lastName: options.lastName,
      ...(options.confirmed === false
        ? {}
        : { emailVerified: true, email_verified_at: sql`now()` }),
    } as never)
    .where("id", "=", user.userId as never)
    .execute();
  await redisClient.delete(`rate-limit:coach:${user.userId}`);
  await redisClient.delete(`rate-limit:coach-learning:${user.userId}`);
  logins[key] = user;
  return user;
}

const JESUS_SLUG = "event-bartimaeus";
const STUDY_BOOK = 59;
const STUDY_CHAPTER = 1;
const SESSION_FAILED = "ff-contract-failed";
const SESSION_RESHARE = "ff-contract-reshare";
const AMENDED = FIXTURE_REPORTS[2].report.id;
const EDITED = FIXTURE_REPORTS[1].report.id;
const LEADER = FIXTURE_LEADERS[0].slug;

let jesusEventId = "";
let themeId = 0;
let topicId = "";
let classesBefore = new Set<string>();

class MonthlyAi implements AiProvider {
  readonly name = "contract";
  async chatComplete(opts: AiChatOptions): Promise<AiChatResponse> {
    const system = opts.messages[0]?.content;
    const said = opts.messages.map((m) => m.content).join("\n");
    if (system === CoachMonthlyService.leaderInstructions())
      return {
        model: "contract",
        content: JSON.stringify({
          profile: { study: "Philippians", format: "Zoom", groupSize: 12 },
          clusterInsights: {
            "Building Ministry": "Homework came up every week.",
            "Teaching Craft": "Scripture led every discussion.",
            "Engaging People": "Quiet members were called on by name.",
            "Being Real": "The leader shared a hard week honestly.",
          },
          strengths: [
            {
              text: "Scripture first",
              quote: "let us read it first",
              session: "2033-03-10",
            },
          ],
          growth: [
            {
              text: "Talk ratio",
              tip: "Ask and count to seven",
              session: "2033-03-10",
            },
          ],
          trends: ["Participation held steady (2033-03-10)."],
          conversationGuide: [
            { label: "Strongest area", q: "What made scripture land?" },
          ],
          focusGoals: ["One delegated prayer each week"],
        }),
      };
    if (system === CoachMonthlyService.programInstructions()) {
      const ids = [...said.matchAll(/leader id: ([a-z-]+)/g)].map((m) => m[1]);
      const figures = [...said.matchAll(/"id":"([a-z0-9-]+)","text"/g)].map(
        (m) => m[1],
      );
      return {
        model: "contract",
        content: JSON.stringify({
          executiveSummary: ["The program held steady this month."],
          trends: ["Participation rose across the program."],
          snapshots: Object.fromEntries(
            ids.map((id) => [
              id,
              "Strong on scripture, growing in delegation.",
            ]),
          ),
          initiatives: figures
            .slice(0, 2)
            .map((figure) => ({ text: "Coach this next month", figure })),
        }),
      };
    }
    throw new Error("unexpected model call in the contract suite");
  }
  private unused(): never {
    throw new Error("not part of the monthly job");
  }
  responsesCreate = () => this.unused();
  filesCreate = () => this.unused();
  filesRetrieve = () => this.unused();
  filesContent = () => this.unused();
  batchesCreate = () => this.unused();
  batchesRetrieve = () => this.unused();
  batchesCancel = () => this.unused();
}

async function seedBible() {
  const theme = await conn
    .selectFrom("highlight_themes")
    .select("theme_id")
    .where("is_active", "=", true)
    .orderBy("priority")
    .orderBy("theme_id")
    .executeTakeFirstOrThrow();
  themeId = Number(theme.theme_id);
  await conn
    .deleteFrom("auto_highlights")
    .where("book_id", "=", 1 as never)
    .where("chapter_number", "=", 1)
    .execute();
  await conn
    .insertInto("auto_highlights")
    .values({
      theme_id: themeId as never,
      book_id: 1 as never,
      chapter_number: 1,
      start_verse: 1,
      end_verse: 3,
      relevance_score: 2,
      created_at: "2026-11-01T10:00:00.000Z",
    })
    .execute();
  await conn
    .deleteFrom("studies")
    .where("book_id", "=", STUDY_BOOK as never)
    .where("chapter", "=", STUDY_CHAPTER)
    .execute();
  await conn
    .insertInto("studies")
    .values({
      book_id: STUDY_BOOK as never,
      chapter: STUDY_CHAPTER,
      content: JSON.stringify(STUDY),
    })
    .execute();
}

async function seedJesus() {
  const event = await conn
    .selectFrom("jesus_events")
    .select("event_id")
    .where("slug", "=", JESUS_SLUG)
    .executeTakeFirstOrThrow();
  jesusEventId = event.event_id as string;
  await clearJesus();
  await conn
    .insertInto("jesus_event_reveals")
    .values([
      {
        event_id: jesusEventId as never,
        channel: "SAYS_ABOUT_HIMSELF",
        content: "He answers the cry for mercy as the Son of David.",
        source_ref: "Mark 10:52",
        provenance: 1,
        language_code: "en-US",
        sort_order: 1,
        is_active: true,
      },
      {
        event_id: jesusEventId as never,
        channel: "DEMONSTRATES",
        content: "Authority over blindness.",
        source_ref: null,
        provenance: 2,
        language_code: "en-US",
        sort_order: 2,
        is_active: true,
      },
    ])
    .execute();
  await conn
    .insertInto("jesus_event_reactions")
    .values({
      event_id: jesusEventId as never,
      who: "The crowd",
      what: "Told him to be quiet",
      source_ref: "Mark 10:48",
      provenance: 1,
      language_code: "en-US",
      sort_order: 1,
    })
    .execute();
  await conn
    .insertInto("jesus_event_people")
    .values({
      event_id: jesusEventId as never,
      person: "Bartimaeus",
      role: "healed",
    })
    .execute();
  await conn
    .insertInto("jesus_event_explanations")
    .values([
      ...["overview", "compare", "insights", "application"].map((type) => ({
        event_id: jesusEventId as never,
        type,
        content: `The ${type} of the healing at Jericho.`,
        language_code: "en-US",
        provenance: 2,
      })),
      {
        event_id: jesusEventId as never,
        type: "study",
        content: JSON.stringify(STUDY),
        language_code: "en-US",
        provenance: 3,
      },
    ])
    .execute();
}

async function clearJesus() {
  if (!jesusEventId) return;
  for (const table of [
    "jesus_event_reveals",
    "jesus_event_reactions",
    "jesus_event_people",
    "jesus_event_explanations",
  ] as const)
    await conn
      .deleteFrom(table)
      .where("event_id", "=", jesusEventId as never)
      .execute();
}

async function seedCoach() {
  await clearCoach();
  await seedCoachFixture(Database);
  await conn
    .insertInto("coach_admins")
    .values({ email: FIXTURE_ADMIN })
    .onConflict((oc) => oc.doNothing())
    .execute();
  for (const id of [AMENDED, EDITED])
    await conn
      .insertInto("coach_report_dimension_scores")
      .values(
        DIMENSIONS.map((d) => ({
          report_id: id,
          dimension_n: d.n,
          score: 4,
          rationale: "The group stayed in the passage.",
          provenance: "machine",
          model_version: "v3-weighted-100",
        })),
      )
      .execute();
  await conn
    .insertInto("coach_intake_sessions")
    .values([
      {
        source_session_id: `ff-${AMENDED}`,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Philippians, Lesson 15",
        session_date: "2033-03-15",
        session_started_at: "2033-03-15T13:00:00.000Z",
        state: "delivered",
        report_id: AMENDED,
        delivered_to: [FIXTURE_LEADERS[0].email],
        published: true,
      },
      {
        source_session_id: `ff-${EDITED}`,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Philippians, Lesson 08",
        session_date: "2033-03-08",
        state: "scored",
        report_id: EDITED,
      },
      {
        source_session_id: SESSION_FAILED,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Philippians, Lesson 16",
        session_date: "2033-03-22",
        session_started_at: "2033-03-22T13:00:00.000Z",
        state: "delivery_failed",
        hold_kind: "send-failed",
        hold_reason: "send failed",
      },
      {
        source_session_id: SESSION_RESHARE,
        coach_id: LEADER,
        matched_by: "title_match",
        title: "Philippians, Lesson 17",
        session_date: "2033-03-29",
        state: "retrieval_failed",
        reshare_requested_at: sql`NOW()`,
      },
    ] as never)
    .execute();
  await conn
    .updateTable("coach_reports")
    .set({ source_session_id: sql`'ff-' || id` })
    .where("id", "in", [AMENDED, EDITED])
    .execute();
  const existing = await conn
    .selectFrom("coach_classes")
    .select("id")
    .execute();
  classesBefore = new Set(existing.map((c) => String(c.id)));
}

async function clearCoach() {
  await conn
    .deleteFrom("coach_intake_sessions")
    .where("source_session_id", "in", [
      `ff-${AMENDED}`,
      `ff-${EDITED}`,
      SESSION_FAILED,
      SESSION_RESHARE,
    ])
    .execute();
  const reports = FIXTURE_REPORTS.map((r) => r.report.id);
  for (const table of [
    "coach_report_amendments",
    "coach_report_edits",
    "coach_report_dimension_scores",
  ] as const)
    await conn.deleteFrom(table).where("report_id", "in", reports).execute();
  await conn
    .deleteFrom("coach_classes")
    .where(
      "coach_id",
      "in",
      FIXTURE_LEADERS.map((l) => l.slug),
    )
    .execute();
  await clearCoachFixture(Database);
}

beforeAll(async () => {
  spyOn(app.store.notification, "sendEmail").mockImplementation(() =>
    Promise.resolve({ delivered: true }),
  );
  await login("reader", { firstName: "Rita", lastName: "Reader" });
  await login("unconfirmed", {
    confirmed: false,
    firstName: "Una",
    lastName: "Unconfirmed",
  });
  await login("deleter", { firstName: "Dana", lastName: "Deleter" });
  await login("learner", { firstName: "Lena", lastName: "Learner" });
  await login("locked", { firstName: "Lou", lastName: "Locked" });
  await seedBible();
  await seedJesus();
  await seedCoach();
  await login("leader", { firstName: "Avery", lastName: "Lane" });
  await login("admin", { firstName: "Ada", lastName: "Admin" });
  await clearLearning();
  const topic = await conn
    .selectFrom("topics")
    .select("topic_id")
    .where("name", "=", "Faith")
    .orderBy("topic_id")
    .executeTakeFirstOrThrow();
  topicId = topic.topic_id as string;
});

afterAll(async () => {
  if (CAPTURE)
    Bun.spawnSync(["bunx", "biome", "format", "--write", PAYLOADS], {
      stdout: "inherit",
      stderr: "inherit",
    });
  await conn
    .deleteFrom("verse_highlights")
    .where("user_id", "=", logins.reader?.userId as never)
    .execute();
  await conn
    .deleteFrom("auto_highlights")
    .where("book_id", "=", 1 as never)
    .where("chapter_number", "=", 1)
    .execute();
  await conn
    .deleteFrom("studies")
    .where("book_id", "=", STUDY_BOOK as never)
    .where("chapter", "=", STUDY_CHAPTER)
    .execute();
  await clearJesus();
  await clearLearning();
  await clearCoach();
  for (const user of Object.values(logins)) {
    await redisClient.set(cacheConstants.accessToken(user.userId), [], "1s");
    await redisClient.delete(`rate-limit:coach:${user.userId}`);
    await redisClient.delete(`rate-limit:coach-learning:${user.userId}`);
  }
  await conn
    .deleteFrom("user")
    .where("email", "in", Object.values(EMAILS))
    .execute();
});

const token = (key: keyof typeof EMAILS) => logins[key].accessToken;

describe("bible routes keep their payloads", () => {
  it("auto-highlights", async () => {
    matchesFixture(
      "bible-auto-highlights",
      await call(null, "GET", "/bible/auto-highlights/1/1"),
    );
  });

  it("highlight themes", async () => {
    matchesFixture(
      "bible-highlight-themes",
      await call(null, "GET", "/bible/highlight-themes"),
    );
  });

  it("theme preferences, updated and read", async () => {
    matchesFixture(
      "bible-theme-preferences-patch",
      await call(
        token("reader"),
        "PATCH",
        `/bible/user/theme-preferences/${themeId}`,
        { is_enabled: true, relevance_threshold: 2 },
      ),
    );
    matchesFixture(
      "bible-theme-preferences",
      await call(token("reader"), "GET", "/bible/user/theme-preferences"),
    );
  });

  it("the inductive study of a chapter", async () => {
    matchesFixture(
      "bible-study",
      await call(null, "GET", `/bible/study/${STUDY_BOOK}/${STUDY_CHAPTER}`),
    );
  });

  it("a highlight saved, then one refused for its overlaps", async () => {
    const add = (start: number, end: number) =>
      call(token("reader"), "POST", "/bible/highlight/add", {
        user_id: logins.reader.userId,
        book_id: 1,
        chapter_number: 1,
        start_verse: start,
        end_verse: end,
        color: "yellow",
      });
    matchesFixture("bible-highlight-add", await add(1, 2));
    matchesFixture("bible-highlight-add-overlap", await add(2, 3));
  });
});

describe("jesus routes keep their payloads", () => {
  const version = "bible_version=NASB1995";
  const cases: Array<[string, string]> = [
    ["jesus-events-overview", "/jesus/events/overview"],
    ["jesus-event", `/jesus/events/${JESUS_SLUG}?${version}`],
    ["jesus-event-default-language", `/jesus/events/${JESUS_SLUG}`],
    ["jesus-event-compare", `/jesus/events/${JESUS_SLUG}/compare?${version}`],
    ["jesus-events-life", "/jesus/events/life"],
    [
      "jesus-collection-by-filter",
      "/jesus/events/collections/every-miracle-of-jesus",
    ],
    ["jesus-collection-by-list", "/jesus/events/collections/the-last-week"],
    ["jesus-events-list", "/jesus/events?type=questions&limit=5"],
    ["jesus-events-browse", "/jesus/events/browse/questions"],
    ["jesus-for-passage", "/jesus/for-passage?book_id=41&chapter=10"],
  ];
  for (const [name, path] of cases)
    it(name, async () => {
      matchesFixture(name, await call(null, "GET", path));
    });
});

describe("topic routes keep their payloads", () => {
  it("one topic", async () => {
    matchesFixture(
      "topics-by-id",
      await call(null, "GET", `/topics/${topicId}?bible_version=NASB1995`),
    );
  });
});

describe("coach routes keep their payloads", () => {
  it("a leader's session list, trends and classes", async () => {
    matchesFixture(
      "coach-reports-summary",
      await call(token("leader"), "GET", "/coach/reports/summary"),
    );
    matchesFixture(
      "coach-trends",
      await call(token("leader"), "GET", "/coach/trends"),
    );
    matchesFixture(
      "coach-class-add",
      await call(token("leader"), "POST", "/coach/classes", {
        name: "Tuesday Dawn",
        classDate: "2033-04-05",
        recurrence: "weekly",
        zoomLink: "https://zoom.example.test/j/123",
        startTime: "06:30",
        timeZone: "America/Chicago",
      }),
      ["id"],
    );
    matchesFixture(
      "coach-classes",
      await call(token("leader"), "GET", "/coach/classes"),
      ["id"],
    );
  });

  it("the admin's view of a leader", async () => {
    matchesFixture(
      "coach-admin-reports-summary",
      await call(
        token("admin"),
        "GET",
        `/coach/admin/coaches/${LEADER}/reports/summary`,
      ),
    );
    matchesFixture(
      "coach-admin-trends",
      await call(
        token("admin"),
        "GET",
        `/coach/admin/coaches/${LEADER}/trends`,
      ),
    );
    const classes = await call(token("admin"), "GET", "/coach/admin/classes");
    matchesFixture(
      "coach-admin-classes",
      {
        status: classes.status,
        body: {
          classes: classes.body?.classes.filter(
            (c: { id: string }) => !classesBefore.has(c.id),
          ),
        },
      },
      ["id"],
    );
  });

  it("a report's revisions after an amend and an edit", async () => {
    const amended = await call(
      token("admin"),
      "POST",
      `/coach/admin/reports/${AMENDED}/amend`,
      {
        dimensions: [{ n: 3, score: 3, rationale: "Fewer cross references" }],
        body: { headline: "A steadier session than it first read" },
      },
    );
    expect(amended.status).toBe(200);
    const edited = await call(
      token("admin"),
      "PUT",
      `/coach/admin/reports/${EDITED}/improvements`,
      { improvements: ["Ask one open question per passage"] },
    );
    expect(edited.status).toBe(200);
    matchesFixture(
      "coach-admin-revisions",
      await call(
        token("admin"),
        "GET",
        `/coach/admin/reports/${AMENDED}/revisions`,
      ),
    );
    matchesFixture(
      "coach-admin-edits",
      await call(
        token("admin"),
        "GET",
        `/coach/admin/reports/${EDITED}/revisions`,
      ),
    );
  });

  it("the monthly reports an admin reviews", async () => {
    await conn
      .deleteFrom("coach_monthly_narratives")
      .where("month", "=", FIXTURE_MONTH)
      .execute();
    await conn
      .deleteFrom("coach_monthly_leader_summaries")
      .where("month", "=", FIXTURE_MONTH)
      .execute();
    await new CoachMonthlyService(Database, new MonthlyAi(), null).produce(
      FIXTURE_MONTH,
    );
    matchesFixture(
      "coach-admin-monthly-reports",
      await call(
        token("admin"),
        "GET",
        `/coach/admin/monthly-reports?month=${FIXTURE_MONTH}`,
      ),
      ["id"],
    );
  });

  it("re-shares and pipeline failures", async () => {
    const reshares = await call(token("admin"), "GET", "/coach/admin/reshares");
    matchesFixture("coach-admin-reshares", {
      status: reshares.status,
      body: {
        requests: reshares.body?.requests.filter(
          (r: { sourceSessionId: string }) =>
            r.sourceSessionId === SESSION_RESHARE,
        ),
      },
    });
    const failures = await call(
      token("admin"),
      "GET",
      "/coach/admin/pipeline-failures?limit=200",
    );
    matchesFixture("coach-admin-pipeline-failures", {
      status: failures.status,
      body: {
        ...failures.body,
        total: "<total>",
        sessions: failures.body?.sessions.filter(
          (s: { sourceSessionId: string }) =>
            s.sourceSessionId === SESSION_FAILED,
        ),
      },
    });
  });

  it("learners, a locked lesson and an approval refused for a changed address", async () => {
    const admin = token("admin");
    const module = await call(admin, "POST", "/coach/admin/learning/modules", {
      title: "Foundations",
      description: "How a session runs",
      passMark: 50,
    });
    const moduleId = module.body?.id;
    const lessons: number[] = [];
    for (const n of [1, 2]) {
      const lesson = await call(
        admin,
        "POST",
        `/coach/admin/learning/modules/${moduleId}/lessons`,
        { title: `Lesson ${n}`, body: `Text of lesson ${n}`, passages: [] },
      );
      lessons.push(lesson.body?.id);
      await call(
        admin,
        "POST",
        `/coach/admin/learning/lessons/${lesson.body?.id}/publish`,
      );
    }
    await call(
      admin,
      "POST",
      `/coach/admin/learning/modules/${moduleId}/questions`,
      {
        prompt: "Who opens the session?",
        options: ["A member", "The leader"],
        correct: 0,
      },
    );
    expect(
      (
        await call(
          admin,
          "POST",
          `/coach/admin/learning/modules/${moduleId}/publish`,
        )
      ).status,
    ).toBe(200);

    const learner = token("learner");
    await call(learner, "POST", "/coach/learning/enrol");
    for (const id of lessons)
      await call(learner, "POST", `/coach/learning/lessons/${id}/done`);
    const check = await call(
      learner,
      "GET",
      `/coach/learning/modules/${moduleId}/check`,
    );
    await call(learner, "POST", `/coach/learning/modules/${moduleId}/check`, {
      version: check.body?.version,
      answers: [{ questionId: check.body?.questions[0].id, option: 0 }],
    });
    expect(
      (await call(learner, "GET", "/coach/learning")).body?.completedAt,
    ).not.toBeNull();
    const request = await call(
      learner,
      "POST",
      "/coach/learning/join-request",
      {
        note: "I lead a Tuesday group",
      },
    );
    expect(request.status).toBe(200);

    const locked = token("locked");
    await call(locked, "POST", "/coach/learning/enrol");
    matchesFixture(
      "coach-learning-locked",
      await call(locked, "GET", `/coach/learning/lessons/${lessons[1]}`),
      ["lessonId", "moduleId"],
    );
    matchesFixture(
      "coach-learning-address-changed",
      await call(
        admin,
        "POST",
        `/coach/admin/learning/requests/${request.body?.request.id}/approve`,
        { email: "an-older-address@example.test" },
      ),
    );
    matchesFixture(
      "coach-admin-learners",
      await call(admin, "GET", "/coach/admin/learning/learners"),
    );
  });
});

describe("error bodies keep their fields", () => {
  it("401 without a session", async () => {
    matchesFixture(
      "error-401",
      await call(null, "GET", "/coach/reports/summary"),
    );
  });

  it("403 with a coach refusal", async () => {
    matchesFixture(
      "error-403-coach-refusal",
      await call(token("unconfirmed"), "GET", "/coach/me"),
    );
  });

  it("422 on a malformed query", async () => {
    matchesFixture(
      "error-422",
      await call(token("leader"), "GET", "/coach/reports/summary?limit=abc"),
    );
  });

  it("429 with retryAfter", async () => {
    const key = `rate-limit:coach:${logins.reader.userId}`;
    await redisClient.delete(key);
    for (let i = 0; i < 120; i++) await redisClient.increment(key, 60);
    const limited = await call(token("reader"), "GET", "/coach/me");
    await redisClient.delete(key);
    expect(typeof limited.body?.retryAfter).toBe("number");
    matchesFixture("error-429", limited);
  });

  it("409 on account deletion while an address change can be undone", async () => {
    const userId = logins.deleter.userId;
    await redisClient.set(
      cacheConstants.emailChangeReverts(userId),
      ["contract-revert"],
      "10m",
    );
    await redisClient.set(
      cacheConstants.emailChangeRevert("contract-revert"),
      { userId },
      "10m",
    );
    const refused = await call(token("deleter"), "DELETE", "/auth/account", {
      password: logins.deleter.password,
    });
    await redisClient.delete(cacheConstants.emailChangeReverts(userId));
    await redisClient.delete(
      cacheConstants.emailChangeRevert("contract-revert"),
    );
    expect(typeof refused.body?.details?.retryAfter).toBe("number");
    matchesFixture("error-409-account-deletion", refused);
  });
});
