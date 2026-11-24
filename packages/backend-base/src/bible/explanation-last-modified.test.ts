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
  let shownEvent = "";
  let hiddenEvent = { id: "", slug: "" };
  let shownTopic = "";
  let hiddenTopic = "";

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

  const seedEvent = async (
    eventId: string,
    createdAt: string,
    updatedAt: string | null,
    active = true,
  ) => {
    const row = await db()
      .insertInto("jesus_event_explanations")
      .values({
        event_id: eventId,
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
  };

  const seedTopic = async (topicId: string, createdAt: string) => {
    const row = await db()
      .insertInto("topic_explanations")
      .values({
        topic_id: topicId,
        type: "summary",
        explanation: "last-modified test",
        language_code: LANG,
        is_active: true,
        created_at: createdAt,
        updated_at: null,
      })
      .returning("explanation_id")
      .executeTakeFirstOrThrow();
    topicExplanations.push(row.explanation_id);
  };

  beforeAll(async () => {
    await seedChapter(
      43,
      3,
      LANG,
      ExplanationTypeEnum.summary,
      "2026-01-05T10:00:00",
    );
    await seedChapter(
      43,
      3,
      LANG,
      ExplanationTypeEnum.byline,
      "2026-03-09T23:30:00",
    );
    await seedChapter(
      43,
      3,
      LANG,
      ExplanationTypeEnum.detailed,
      "2026-09-01T00:00:00",
      false,
    );
    await seedChapter(
      1,
      1,
      LANG,
      ExplanationTypeEnum.summary,
      "2025-12-31T23:00:00",
    );

    const events = await db()
      .selectFrom("jesus_events")
      .select(["event_id", "slug"])
      .where("is_active", "=", true)
      .orderBy("event_id")
      .limit(2)
      .execute();
    shownEvent = events[0].slug;
    hiddenEvent = { id: events[1].event_id, slug: events[1].slug };
    await seedEvent(
      events[0].event_id,
      "2026-02-01T00:00:00",
      "2026-04-02T12:00:00",
    );
    await seedEvent(
      events[0].event_id,
      "2026-05-01T00:00:00",
      "2026-05-01T00:00:00",
      false,
    );
    await seedEvent(events[1].event_id, "2026-06-01T00:00:00", null);
    await db()
      .updateTable("jesus_events")
      .set({ is_active: false })
      .where("event_id", "=", hiddenEvent.id)
      .execute();

    const topics = await db()
      .selectFrom("topics")
      .select("topic_id")
      .where("is_active", "=", true)
      .orderBy("topic_id")
      .limit(2)
      .execute();
    shownTopic = topics[0].topic_id;
    hiddenTopic = topics[1].topic_id;
    await seedTopic(shownTopic, "2026-06-10T09:00:00");
    await seedTopic(hiddenTopic, "2026-06-11T09:00:00");
    await db()
      .updateTable("topics")
      .set({ is_active: false })
      .where("topic_id", "=", hiddenTopic)
      .execute();

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
      "2026-01-05T10:00:00",
    );
  });

  afterAll(async () => {
    await db()
      .updateTable("jesus_events")
      .set({ is_active: true })
      .where("event_id", "=", hiddenEvent.id)
      .execute();
    await db()
      .updateTable("topics")
      .set({ is_active: true })
      .where("topic_id", "=", hiddenTopic)
      .execute();
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

  const fetchLastModified = (query: string) =>
    Backend.handle(
      new Request(`http://localhost/bible/explanations/last-modified${query}`),
    );
  const body = async (query: string) =>
    (await (await fetchLastModified(query)).json()) as LastModified;

  it("gives each chapter the day of its newest active explanation of any type, in that language", async () => {
    const response = await fetchLastModified(`?lang=${LANG}`);
    const lists = (await response.json()) as LastModified;

    expect(response.status).toBe(200);
    expect(lists.language).toBe(LANG);
    expect(lists.chapters).toEqual([
      { bookId: 1, chapter: 1, lastModified: "2025-12-31" },
      { bookId: 43, chapter: 3, lastModified: "2026-03-09" },
    ]);
  });

  it("gives active events and topics the later of created and updated, and leaves out inactive ones", async () => {
    const lists = await body(`?lang=${LANG}`);

    expect(lists.events).toEqual([
      { slug: shownEvent, lastModified: "2026-04-02" },
    ]);
    expect(lists.events.some((event) => event.slug === hiddenEvent.slug)).toBe(
      false,
    );
    expect(lists.topics).toEqual([
      { topicId: shownTopic, lastModified: "2026-06-10" },
    ]);
  });

  it("answers empty lists for a language that is switched off or has nothing", async () => {
    expect(await body(`?lang=${LANG_OFF}`)).toEqual({
      language: LANG_OFF,
      chapters: [],
      events: [],
      topics: [],
    });
    expect(await body("?lang=zz-Nothing")).toEqual({
      language: "zz-Nothing",
      chapters: [],
      events: [],
      topics: [],
    });
  });

  it("is cacheable for an hour, which the sitemaps' one-day freshness budget counts on", async () => {
    expect(
      (await fetchLastModified(`?lang=${LANG}`)).headers.get("cache-control"),
    ).toBe("public, max-age=3600");
  });

  it("refuses a missing, empty, malformed or overlong language", async () => {
    for (const query of [
      "",
      "?lang=",
      "?lang=not a code",
      `?lang=en-${"abcdefgh-".repeat(5)}x1`,
    ]) {
      expect((await fetchLastModified(query)).status, query).toBe(422);
    }
  });
});
