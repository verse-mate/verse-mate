import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db as Database } from "database";
import { sql } from "kysely";

import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import { COACH_PIPELINE_LIVE } from "../coach/coach-cutover";
import {
  FIXTURE_ADMIN,
  FIXTURE_LEADERS,
  FIXTURE_MONTH,
  FIXTURE_REPORTS,
  clearCoachFixture,
  fixtureReport,
  seedCoachFixture,
} from "../coach/coach-fixture";
import { LEARNING_TABLES } from "../coach/coach-learning.fixture";
import { CoachMonthlyService } from "../coach/coach-monthly.service";
import { reportToRow } from "../coach/coach-store.transform";
import { isolateTable } from "../coach/coach-test-tables";
import { DIMENSIONS } from "../coach/rubric";
import type { AiChatOptions, AiChatResponse, AiProvider } from "../shared/ai";
import cacheConstants from "../shared/cache.constants";
import redisClient from "../shared/redis-client";
import { createTestUser } from "../shared/test-helpers";
import { contractApp } from "./contract-app";
import { OPENAPI_SPEC_PATH, openapiDocs } from "./openapi-document";

const PAYLOADS = join(import.meta.dir, "payloads");
const CAPTURE = process.env.CONTRACT_CAPTURE === "1";
const STUDY = JSON.parse(
  readFileSync(join(import.meta.dir, "inputs", "study-james-1.json"), "utf8"),
);

const db = () => Database.getOrCreateConnection();
isolateTable("coach_admins");
isolateTable("coach_monthly_reports");

const app = contractApp();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TOKEN = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

const pathMatches = (pattern: string[], path: string[]) =>
  pattern.length === path.length &&
  pattern.every((part, i) => part === "*" || part === path[i]);

function normalise(
  value: unknown,
  masks: string[][],
  path: string[] = [],
): unknown {
  if (value !== null && masks.some((mask) => pathMatches(mask, path)))
    return `<${Array.isArray(value) ? "array" : typeof value}>`;
  if (Array.isArray(value))
    return value.map((v, i) => normalise(v, masks, [...path, String(i)]));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        normalise(v, masks, [...path, k]),
      ]),
    );
  if (typeof value === "string") {
    if (UUID.test(value)) return "<uuid>";
    if (DATE_TIME.test(value)) return "<date-time>";
    if (TOKEN.test(value)) return "<token>";
  }
  return value;
}

type Json = Record<string, any>;
let published: Json | null = null;
const ajv = new Ajv2020({ strict: false, logger: false, allErrors: true });
addFormats(ajv as unknown as Parameters<typeof addFormats>[0]);

function closed(schema: unknown, inAllOf = false): unknown {
  if (Array.isArray(schema)) return schema.map((s) => closed(s, inAllOf));
  if (!schema || typeof schema !== "object") return schema;
  const out: Json = {};
  for (const [key, value] of Object.entries(schema))
    out[key] =
      key === "allOf"
        ? (value as unknown[]).map((v) => closed(v, true))
        : closed(value);
  if (out.type === "object" && !("additionalProperties" in out) && !inAllOf)
    out.additionalProperties = false;
  return out;
}

async function documentSchema(method: string, url: string, status: number) {
  published ??= await (
    await contractApp()
      .use(openapiDocs())
      .handle(new Request(`http://localhost${OPENAPI_SPEC_PATH}`))
  ).json();
  const path = url.split("?")[0];
  const template = Object.keys(published?.paths ?? {})
    .filter((t) =>
      new RegExp(`^${t.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(path),
    )
    .sort(
      (a, b) => (a.match(/\{/g)?.length ?? 0) - (b.match(/\{/g)?.length ?? 0),
    )[0];
  const response =
    published?.paths[template]?.[method.toLowerCase()]?.responses?.[
      String(status)
    ];
  if (!response)
    throw new Error(`${method} ${template ?? path} does not declare ${status}`);
  return { template, response: response as Json };
}

async function conforms(
  method: string,
  url: string,
  status: number,
  body: unknown,
) {
  if (CAPTURE) return;
  const { template, response } = await documentSchema(method, url, status);
  const schema = response.content?.["application/json"]?.schema;
  if (!schema) {
    if (body !== null)
      throw new Error(
        `${method} ${template} ${status} answered a body it does not declare`,
      );
    return;
  }
  const validate = ajv.compile(closed(schema) as object);
  if (!validate(body))
    throw new Error(
      `${method} ${template} ${status} does not fit its schema: ${JSON.stringify(validate.errors?.slice(0, 5))}`,
    );
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
  await conforms(method, path, res.status, parsed);
  return { status: res.status, body: parsed as any };
}

async function ok(response: Promise<{ status: number; body: any }>) {
  const answered = await response;
  expect(answered.status).toBe(200);
  return answered;
}

function matchesFixture(
  name: string,
  response: { status: number; body: unknown },
  masks: string[] = [],
) {
  const actual = normalise(
    response,
    masks.map((mask) => mask.split(".")),
  );
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

const restores: Array<{
  clear: () => Promise<void>;
  refill: () => Promise<void>;
}> = [];

async function setAside(table: string, where: Record<string, unknown> = {}) {
  const filter = (query: any) =>
    Object.entries(where).reduce(
      (q, [column, value]) =>
        Array.isArray(value)
          ? q.where(column, "in", value)
          : q.where(column, "=", value),
      query,
    );
  const kept = await filter(
    db()
      .selectFrom(table as never)
      .selectAll(),
  ).execute();
  await filter(db().deleteFrom(table as never)).execute();
  restores.push({
    clear: async () => {
      await filter(db().deleteFrom(table as never)).execute();
    },
    refill: async () => {
      if (kept.length > 0)
        await db()
          .insertInto(table as never)
          .values(kept as never)
          .execute();
    },
  });
}

const EMAILS = {
  reader: "contract-reader@example.test",
  unconfirmed: "contract-unconfirmed@example.test",
  deleter: "contract-deleter@example.test",
  learner: "contract-learner@example.test",
  locked: "contract-locked@example.test",
  leader: FIXTURE_LEADERS[0].email,
  keeper: "contract-keeper@example.test",
  admin: FIXTURE_ADMIN,
};

type Login = Awaited<ReturnType<typeof createTestUser>>;
const logins = {} as Record<keyof typeof EMAILS, Login>;

async function login(
  key: keyof typeof EMAILS,
  options: { confirmed?: boolean; firstName: string; lastName: string },
) {
  const email = EMAILS[key];
  await db().deleteFrom("user").where("email", "=", email).execute();
  const user = await createTestUser({ email });
  await db()
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
const NA_LEADER = "contract-na-leader";
const KEEPER = "contract-keeper";
const EXTRA_KEY_EVENT = "event-baptism";
const IRREGULAR_CHAPTER = 2;

const IRREGULAR_STUDY = {
  bookId: STUDY_BOOK,
  bookName: "James",
  chapter: String(IRREGULAR_CHAPTER),
  title: "James 2",
  subtitle: null,
  stepsNote: "kept from an earlier translation run",
  steps: [
    {
      number: 1,
      kind: "bullets",
      title: "Read",
      summary: "Read the chapter twice",
      intro: null,
      items: [{ tag: null, text: "Faith and works" }, "a loose line"],
      note: null,
      translatedBy: "batch-7",
    },
    {
      number: 2,
      title: "Ask",
      items: [{ q: null, a: "James" }],
    },
    {
      number: 3,
      kind: "lists",
      title: "Lists",
      summary: "",
      lists: [
        { title: "Works", rows: ["2:14 Faith without works", { ref: "2:17" }] },
      ],
    },
    "a step that is only text",
  ],
  interpretation: {
    intro: null,
    movements: [
      { number: 1, title: "Faith works", body: "Shown by deeds" },
      "loose",
    ],
  },
  application: { questions: [{ range: "2:26", question: null }] },
};

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
  const theme = await db()
    .selectFrom("highlight_themes")
    .select("theme_id")
    .where("is_active", "=", true)
    .orderBy("priority")
    .orderBy("theme_id")
    .executeTakeFirstOrThrow();
  themeId = Number(theme.theme_id);
  await setAside("auto_highlights", { book_id: 1, chapter_number: 1 });
  await db()
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
  const studies = await db()
    .selectFrom("studies")
    .select("study_id")
    .where("book_id", "=", STUDY_BOOK as never)
    .where("chapter", "in", [STUDY_CHAPTER, IRREGULAR_CHAPTER])
    .execute();
  if (studies.length > 0)
    await setAside("study_translations", {
      study_id: studies.map((study) => study.study_id),
    });
  await setAside("studies", {
    book_id: STUDY_BOOK,
    chapter: [STUDY_CHAPTER, IRREGULAR_CHAPTER],
  });
  await db()
    .insertInto("studies")
    .values({
      book_id: STUDY_BOOK as never,
      chapter: STUDY_CHAPTER,
      content: JSON.stringify(STUDY),
    })
    .execute();
  await db()
    .insertInto("studies")
    .values({
      book_id: STUDY_BOOK as never,
      chapter: IRREGULAR_CHAPTER,
      content: JSON.stringify(IRREGULAR_STUDY),
    })
    .execute();
}

async function seedJesus() {
  const event = await db()
    .selectFrom("jesus_events")
    .select("event_id")
    .where("slug", "=", JESUS_SLUG)
    .executeTakeFirstOrThrow();
  jesusEventId = event.event_id as string;
  for (const table of [
    "jesus_event_reveals",
    "jesus_event_reactions",
    "jesus_event_people",
    "jesus_event_explanations",
  ])
    await setAside(table, { event_id: jesusEventId });
  const extra = await db()
    .selectFrom("jesus_events")
    .select("event_id")
    .where("slug", "=", EXTRA_KEY_EVENT)
    .executeTakeFirstOrThrow();
  await setAside("jesus_event_explanations", { event_id: extra.event_id });
  await db()
    .insertInto("jesus_event_explanations")
    .values({
      event_id: extra.event_id as never,
      type: "study",
      content: JSON.stringify({
        ...STUDY,
        reviewedBy: "a second reader",
        steps: STUDY.steps.map((step: Record<string, unknown>, i: number) =>
          i === 0 ? { ...step, source: "Mark 1:9-11" } : step,
        ),
        interpretation: { ...STUDY.interpretation, emphasis: "the voice" },
      }),
      language_code: "en-US",
      provenance: 3,
    })
    .execute();
  await db()
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
  await db()
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
  await db()
    .insertInto("jesus_event_people")
    .values({
      event_id: jesusEventId as never,
      person: "Bartimaeus",
      role: "healed",
    })
    .execute();
  await db()
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

async function seedCoach() {
  await clearCoach();
  await seedCoachFixture(Database);
  await db()
    .insertInto("coach_admins")
    .values({ email: FIXTURE_ADMIN })
    .onConflict((oc) => oc.doNothing())
    .execute();
  for (const id of [AMENDED, EDITED])
    await db()
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
  await db()
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
  await db()
    .updateTable("coach_reports")
    .set({ source_session_id: sql`'ff-' || id` })
    .where("id", "in", [AMENDED, EDITED])
    .execute();
  await db()
    .insertInto("coach_leaders")
    .values({
      slug: NA_LEADER,
      email: "contract-na@example.test",
      name: "Noa Absent",
    })
    .execute();
  for (const [date, score] of [
    ["2032-11-02", 70.5],
    ["2032-11-09", 74.1],
  ] as const) {
    const report = fixtureReport(`${NA_LEADER}-${date}`, date, score);
    report.dimensions = report.dimensions.map((d) =>
      d.n === 9 ? { ...d, score: null, note: "N/A on a first lesson" } : d,
    );
    await db()
      .insertInto("coach_reports")
      .values(reportToRow(NA_LEADER, report as never) as never)
      .execute();
  }
  await db()
    .insertInto("coach_leaders")
    .values({ slug: KEEPER, email: EMAILS.keeper, name: "Kit Keeper" })
    .execute();
  const kept = reportToRow(
    KEEPER,
    fixtureReport(`${KEEPER}-2032-10-05`, "2032-10-05", 77.2) as never,
  );
  await db()
    .insertInto("coach_reports")
    .values({
      ...kept,
      summary: JSON.stringify({ ...kept.summary, venue: "Fellowship hall" }),
    } as never)
    .execute();
  const existing = await db()
    .selectFrom("coach_classes")
    .select("id")
    .execute();
  classesBefore = new Set(existing.map((c) => String(c.id)));
}

async function clearCoach() {
  await db()
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
    await db().deleteFrom(table).where("report_id", "in", reports).execute();
  await db()
    .deleteFrom("coach_classes")
    .where(
      "coach_id",
      "in",
      FIXTURE_LEADERS.map((l) => l.slug),
    )
    .execute();
  await db()
    .deleteFrom("coach_reports")
    .where("coach_id", "in", [NA_LEADER, KEEPER])
    .execute();
  await db()
    .deleteFrom("coach_leaders")
    .where("slug", "in", [NA_LEADER, KEEPER])
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
  await login("keeper", { firstName: "Kit", lastName: "Keeper" });
  for (const table of LEARNING_TABLES) await setAside(table);
  const topic = await db()
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
  for (const { clear } of restores) await clear();
  await db()
    .deleteFrom("verse_highlights")
    .where("user_id", "=", logins.reader?.userId as never)
    .execute();
  await clearCoach();
  for (const user of Object.values(logins)) {
    await redisClient.set(cacheConstants.accessToken(user.userId), [], "1s");
    await redisClient.delete(`rate-limit:coach:${user.userId}`);
    await redisClient.delete(`rate-limit:coach-learning:${user.userId}`);
  }
  await db()
    .deleteFrom("user")
    .where("email", "in", Object.values(EMAILS))
    .execute();
  for (const { refill } of [...restores].reverse()) await refill();
});

const token = (key: keyof typeof EMAILS) => logins[key].accessToken;

describe("bible routes keep their payloads", () => {
  it("auto-highlights", async () => {
    matchesFixture(
      "bible-auto-highlights",
      await call(null, "GET", "/bible/auto-highlights/1/1"),
      ["body.data.*.auto_highlight_id"],
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

  it("a stored study that does not follow the study shape", async () => {
    matchesFixture(
      "bible-study-irregular",
      await call(
        null,
        "GET",
        `/bible/study/${STUDY_BOOK}/${IRREGULAR_CHAPTER}`,
      ),
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
    matchesFixture("bible-highlight-add", await add(1, 2), [
      "body.highlight.highlight_id",
    ]);
    matchesFixture("bible-highlight-add-overlap", await add(2, 3), [
      "body.overlaps.*.highlight_id",
    ]);
  });
});

describe("jesus routes keep their payloads", () => {
  it("an event study with keys the schema does not name", async () => {
    matchesFixture(
      "jesus-event-study-extra-keys",
      await call(null, "GET", `/jesus/events/${EXTRA_KEY_EVENT}`),
    );
  });

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
      ["body.class.id"],
    );
    matchesFixture(
      "coach-classes",
      await call(token("leader"), "GET", "/coach/classes"),
      ["body.classes.*.id"],
    );
  });

  it("a stored summary key the schema does not name", async () => {
    matchesFixture(
      "coach-reports-summary-extra-key",
      await call(token("keeper"), "GET", "/coach/reports/summary"),
    );
    matchesFixture(
      "coach-admin-reports-summary-extra-key",
      await call(
        token("admin"),
        "GET",
        `/coach/admin/coaches/${KEEPER}/reports/summary`,
      ),
    );
  });

  it("trends with a dimension scored N/A", async () => {
    matchesFixture(
      "coach-admin-trends-not-applicable",
      await call(
        token("admin"),
        "GET",
        `/coach/admin/coaches/${NA_LEADER}/trends`,
      ),
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
      ["body.classes.*.id"],
    );
  });

  it("a report's revisions after an amend and an edit", async () => {
    process.env[COACH_PIPELINE_LIVE] = "true";
    const amended = await ok(
      call(token("admin"), "POST", `/coach/admin/reports/${AMENDED}/amend`, {
        dimensions: [{ n: 3, score: 3, rationale: "Fewer cross references" }],
        body: { headline: "A steadier session than it first read" },
      }),
    ).finally(() => {
      delete process.env[COACH_PIPELINE_LIVE];
    });
    expect(amended.body).toMatchObject({ applied: true, sent: true });
    const reamended = await ok(
      call(token("admin"), "POST", `/coach/admin/reports/${AMENDED}/amend`, {
        firstLesson: true,
        body: {
          strengthsProse: [
            {
              title: "Scripture first",
              paragraphs: ["Every question went back to the passage."],
            },
          ],
        },
      }),
    );
    expect(reamended.body?.applied).toBe(true);
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
      ["body.revisions.*.edit"],
    );
  });

  it("the monthly reports an admin reviews", async () => {
    await db()
      .deleteFrom("coach_monthly_narratives")
      .where("month", "=", FIXTURE_MONTH)
      .execute();
    await db()
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
      ["body.reports.*.id"],
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
    const module = await ok(
      call(admin, "POST", "/coach/admin/learning/modules", {
        title: "Foundations",
        description: "How a session runs",
        passMark: 50,
      }),
    );
    const moduleId = module.body?.id;
    const lessons: number[] = [];
    for (const n of [1, 2]) {
      const lesson = await ok(
        call(
          admin,
          "POST",
          `/coach/admin/learning/modules/${moduleId}/lessons`,
          { title: `Lesson ${n}`, body: `Text of lesson ${n}`, passages: [] },
        ),
      );
      lessons.push(lesson.body?.id);
      await ok(
        call(
          admin,
          "POST",
          `/coach/admin/learning/lessons/${lesson.body?.id}/publish`,
        ),
      );
    }
    await ok(
      call(
        admin,
        "POST",
        `/coach/admin/learning/modules/${moduleId}/questions`,
        {
          prompt: "Who opens the session?",
          options: ["A member", "The leader"],
          correct: 0,
        },
      ),
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
    await ok(call(learner, "POST", "/coach/learning/enrol"));
    for (const id of lessons)
      await ok(call(learner, "POST", `/coach/learning/lessons/${id}/done`));
    const check = await ok(
      call(learner, "GET", `/coach/learning/modules/${moduleId}/check`),
    );
    const graded = await ok(
      call(learner, "POST", `/coach/learning/modules/${moduleId}/check`, {
        version: check.body?.version,
        answers: [{ questionId: check.body?.questions[0].id, option: 0 }],
      }),
    );
    expect(graded.body?.passed).toBe(true);
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
    await ok(call(locked, "POST", "/coach/learning/enrol"));
    matchesFixture(
      "coach-learning-locked",
      await call(locked, "GET", `/coach/learning/lessons/${lessons[1]}`),
      ["body.details.next.lessonId", "body.details.next.moduleId"],
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

  it("401 from the session guard, and from a refused password behind it", async () => {
    matchesFixture("error-401-guard", await call(null, "GET", "/auth/session"));
    matchesFixture(
      "error-401-wrong-password",
      await call(token("reader"), "DELETE", "/auth/account", {
        password: "not-the-password",
      }),
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
    matchesFixture("error-429", limited, ["body.retryAfter"]);
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
    matchesFixture("error-409-account-deletion", refused, [
      "body.details.retryAfter",
    ]);
  });
});
