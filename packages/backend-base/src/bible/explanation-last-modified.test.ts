import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import Backend from "./bible.plugin";

const LANG = "zz-LastMod";
const LANG_OFF = "zz-LastOff";

type LastModified = {
  language: string;
  chapters: { bookId: number; chapter: number; lastModified: string }[];
  events: { slug: string; lastModified: string }[];
  topics: { topicId: string; lastModified: string }[];
};

describe("GET /bible/explanations/last-modified", () => {
  const db = () => Backend.store.db.getOrCreateConnection();
  const explanations: number[] = [];
  const eventExplanations: string[] = [];
  const topicExplanations: string[] = [];
  let eventSlug = "";
  let topicId = "";

  const chapterId = async (bookId: number, chapterNumber: number) =>
    (
      await db()
        .selectFrom("chapters")
        .select("chapter_id")
        .where("book_id", "=", bookId)
        .where("chapter_number", "=", chapterNumber)
        .executeTakeFirstOrThrow()
    ).chapter_id;

  const seedChapter = async (
    bookId: number,
    chapterNumber: number,
    language: string,
    type: ExplanationTypeEnum,
    createdAt: string,
    isActive = true,
  ) => {
    const row = await db()
      .insertInto("explanations")
      .values({
        type,
        explanation: "last-modified test",
        chapter_id: await chapterId(bookId, chapterNumber),
        is_active: isActive,
        created_by_admin: true,
        language_code: language,
        created_at: createdAt,
      })
      .returning("explanation_id")
      .executeTakeFirstOrThrow();
    explanations.push(row.explanation_id);
  };

  beforeAll(async () => {
    await seedChapter(
      43,
      3,
      LANG,
      ExplanationTypeEnum.summary,
      "2026-01-05T10:00:00Z",
    );
    await seedChapter(
      43,
      3,
      LANG,
      ExplanationTypeEnum.byline,
      "2026-03-09T08:30:00Z",
    );
    await seedChapter(
      43,
      3,
      LANG,
      ExplanationTypeEnum.detailed,
      "2026-09-01T00:00:00Z",
      false,
    );
    await seedChapter(
      1,
      1,
      LANG,
      ExplanationTypeEnum.summary,
      "2025-12-31T23:00:00Z",
    );

    const event = await db()
      .selectFrom("jesus_events")
      .select(["event_id", "slug"])
      .orderBy("event_id")
      .executeTakeFirstOrThrow();
    eventSlug = event.slug;
    for (const [createdAt, updatedAt, active] of [
      ["2026-02-01T00:00:00Z", "2026-04-02T12:00:00Z", true],
      ["2026-05-01T00:00:00Z", "2026-05-01T00:00:00Z", false],
    ] as const) {
      const row = await db()
        .insertInto("jesus_event_explanations")
        .values({
          event_id: event.event_id,
          type: "summary",
          content: "last-modified test",
          language_code: LANG,
          is_active: active,
          created_at: createdAt,
          updated_at: updatedAt,
        })
        .returning("explanation_id")
        .executeTakeFirstOrThrow();
      eventExplanations.push(row.explanation_id);
    }

    const topic = await db()
      .selectFrom("topics")
      .select("topic_id")
      .orderBy("topic_id")
      .executeTakeFirstOrThrow();
    topicId = topic.topic_id;
    const row = await db()
      .insertInto("topic_explanations")
      .values({
        topic_id: topicId,
        type: "summary",
        explanation: "last-modified test",
        language_code: LANG,
        is_active: true,
        created_at: "2026-06-10T09:00:00Z",
        updated_at: null,
      })
      .returning("explanation_id")
      .executeTakeFirstOrThrow();
    topicExplanations.push(row.explanation_id);

    await db()
      .insertInto("explanation_languages")
      .values({
        language_code: LANG_OFF,
        name: "Disabled",
        native_name: "Disabled",
        is_enabled: false,
      })
      .execute();
    await seedChapter(
      43,
      3,
      LANG_OFF,
      ExplanationTypeEnum.summary,
      "2026-01-05T10:00:00Z",
    );
  });

  afterAll(async () => {
    if (explanations.length)
      await db()
        .deleteFrom("explanations")
        .where("explanation_id", "in", explanations)
        .execute();
    if (eventExplanations.length)
      await db()
        .deleteFrom("jesus_event_explanations")
        .where("explanation_id", "in", eventExplanations)
        .execute();
    if (topicExplanations.length)
      await db()
        .deleteFrom("topic_explanations")
        .where("explanation_id", "in", topicExplanations)
        .execute();
    await db()
      .deleteFrom("explanation_languages")
      .where("language_code", "=", LANG_OFF)
      .execute();
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  const fetchLastModified = async (query: string) => {
    const response = await Backend.handle(
      new Request(`http://localhost/bible/explanations/last-modified${query}`),
    );
    return response;
  };

  it("gives each chapter the newest active explanation of any type, in that language", async () => {
    const response = await fetchLastModified(`?lang=${LANG}`);
    const body = (await response.json()) as LastModified;

    expect(response.status).toBe(200);
    expect(body.language).toBe(LANG);
    expect(body.chapters).toEqual([
      { bookId: 1, chapter: 1, lastModified: "2025-12-31T23:00:00.000Z" },
      { bookId: 43, chapter: 3, lastModified: "2026-03-09T08:30:00.000Z" },
    ]);
  });

  it("gives events and topics the later of created and updated, ignoring inactive rows", async () => {
    const body = (await (
      await fetchLastModified(`?lang=${LANG}`)
    ).json()) as LastModified;

    expect(body.events).toEqual([
      { slug: eventSlug, lastModified: "2026-04-02T12:00:00.000Z" },
    ]);
    expect(body.topics).toEqual([
      { topicId, lastModified: "2026-06-10T09:00:00.000Z" },
    ]);
  });

  it("answers empty lists for a language that is switched off", async () => {
    const body = (await (
      await fetchLastModified(`?lang=${LANG_OFF}`)
    ).json()) as LastModified;

    expect(body).toEqual({
      language: LANG_OFF,
      chapters: [],
      events: [],
      topics: [],
    });
  });

  it("is public and cacheable for an hour", async () => {
    const response = await fetchLastModified(`?lang=${LANG}`);

    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("refuses a missing or malformed language", async () => {
    expect((await fetchLastModified("")).status).toBe(422);
    expect((await fetchLastModified("?lang=not a code")).status).toBe(422);
  });
});
