import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { db as Database } from "database";
import { JesusEventRepository } from "./jesus-event.repository";
import { JesusRepository } from "./jesus.repository";

const FIXTURE_CODE_PATTERN = "q'%";
const languageCode = `q'${faker.string.alpha(4).toLowerCase()}`;

describe("Jesus repositories with a language code that needs escaping", () => {
  const repository = new JesusRepository(Database);
  const eventRepository = new JesusEventRepository(Database);
  const conn = () => Database.getOrCreateConnection();

  let periodId: string;
  let collectionId: string;
  let entry: { entry_id: string; slug: string; theme_id: string };
  let event: { event_id: string; theme_id: string };
  const labels = {
    period: faker.lorem.words(3),
    collection: faker.lorem.words(3),
    entryTheme: faker.lorem.words(3),
    eventTheme: faker.lorem.words(3),
    entryTitle: faker.lorem.sentence(),
    person: `${faker.person.firstName()} ${faker.string.alphanumeric(8)}`,
  };

  const removeFixtures = () =>
    Promise.all([
      conn()
        .deleteFrom("jesus_label_translations")
        .where("language_code", "like", FIXTURE_CODE_PATTERN)
        .execute(),
      conn()
        .deleteFrom("jesus_entry_translations")
        .where("language_code", "like", FIXTURE_CODE_PATTERN)
        .execute(),
      conn()
        .deleteFrom("jesus_event_people")
        .where("person", "=", labels.person)
        .execute(),
    ]);

  beforeAll(async () => {
    await removeFixtures();

    const period = await conn()
      .selectFrom("jesus_periods")
      .where("is_active", "=", true)
      .select("period_id")
      .orderBy("period_id")
      .executeTakeFirstOrThrow();
    periodId = period.period_id;

    const collection = await conn()
      .selectFrom("jesus_collections")
      .where("is_active", "=", true)
      .select("collection_id")
      .orderBy("collection_id")
      .executeTakeFirstOrThrow();
    collectionId = collection.collection_id;

    entry = await conn()
      .selectFrom("jesus_entries")
      .innerJoin(
        "jesus_entry_themes",
        "jesus_entry_themes.entry_id",
        "jesus_entries.entry_id",
      )
      .innerJoin(
        "jesus_themes",
        "jesus_themes.theme_id",
        "jesus_entry_themes.theme_id",
      )
      .where("jesus_entries.is_active", "=", true)
      .where("jesus_themes.is_active", "=", true)
      .select([
        "jesus_entries.entry_id",
        "jesus_entries.slug",
        "jesus_themes.theme_id",
      ])
      .orderBy("jesus_entries.entry_id")
      .executeTakeFirstOrThrow();

    event = await conn()
      .selectFrom("jesus_event_themes")
      .innerJoin(
        "jesus_themes",
        "jesus_themes.theme_id",
        "jesus_event_themes.theme_id",
      )
      .innerJoin(
        "jesus_events",
        "jesus_events.event_id",
        "jesus_event_themes.event_id",
      )
      .where("jesus_themes.is_active", "=", true)
      .where("jesus_events.is_active", "=", true)
      .where("jesus_themes.theme_id", "!=", entry.theme_id)
      .select(["jesus_event_themes.event_id", "jesus_themes.theme_id"])
      .orderBy("jesus_event_themes.event_id")
      .executeTakeFirstOrThrow();

    await conn()
      .insertInto("jesus_label_translations")
      .values([
        {
          entity_type: "period",
          entity_id: periodId,
          language_code: languageCode,
          translated_name: labels.period,
          is_active: true,
        },
        {
          entity_type: "collection",
          entity_id: collectionId,
          language_code: languageCode,
          translated_name: labels.collection,
          is_active: true,
        },
        {
          entity_type: "theme",
          entity_id: entry.theme_id,
          language_code: languageCode,
          translated_name: labels.entryTheme,
          is_active: true,
        },
        {
          entity_type: "theme",
          entity_id: event.theme_id,
          language_code: languageCode,
          translated_name: labels.eventTheme,
          is_active: true,
        },
      ])
      .execute();

    await conn()
      .insertInto("jesus_event_people")
      .values({ event_id: event.event_id, person: labels.person })
      .execute();

    await conn()
      .insertInto("jesus_entry_translations")
      .values({
        entry_id: entry.entry_id,
        language_code: languageCode,
        translated_title: labels.entryTitle,
        is_active: true,
      })
      .execute();
  });

  afterAll(async () => {
    await removeFixtures();
    Database.closeConnection();
  });

  it("getPeriods returns the translation stored under that code", async () => {
    const periods = await repository.getPeriods(languageCode);
    const period = periods.find((p) => p.period_id === periodId);
    expect(period?.name).toBe(labels.period);
  });

  it("getThemes returns the translation stored under that code", async () => {
    const themes = await repository.getThemes(languageCode);
    const theme = themes.find((t) => t.theme_id === entry.theme_id);
    expect(theme?.name).toBe(labels.entryTheme);
  });

  it("getCollections returns the translation stored under that code", async () => {
    const collections = await repository.getCollections(languageCode);
    const collection = collections.find(
      (c) => c.collection_id === collectionId,
    );
    expect(collection?.name).toBe(labels.collection);
  });

  it("listEntries returns translated entries and themes", async () => {
    const entries = await repository.listEntries(
      { entryIds: [entry.entry_id] },
      { languageCode },
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe(labels.entryTitle);
    expect(entries[0].themes.map((t) => t.name)).toContain(labels.entryTheme);
  });

  it("getEntryBySlug returns the translated entry", async () => {
    const found = await repository.getEntryBySlug(entry.slug, languageCode);
    expect(found?.title).toBe(labels.entryTitle);
    expect(found?.themes.map((t) => t.name)).toContain(labels.entryTheme);
  });

  it("listEvents returns translated event themes", async () => {
    const events = await eventRepository.listEvents(
      { eventIds: [event.event_id] },
      { languageCode },
    );
    expect(events).toHaveLength(1);
    expect(events[0].themes.map((t) => t.name)).toContain(labels.eventTheme);
  });

  it("listEntries treats LIKE wildcards in a search as plain text", async () => {
    const all = await repository.countEntries();
    const entries = await repository.listEntries(
      { search: "%" },
      { limit: all },
    );
    expect(
      entries.every((e) => `${e.title}${e.summary}${e.quote}`.includes("%")),
    ).toBe(true);
    expect(entries.length).toBeLessThan(all);
  });

  it("listEvents treats LIKE wildcards in search and person as plain text", async () => {
    const all = await eventRepository.countEvents();
    expect(await eventRepository.countEvents({ search: "_" })).toBeLessThan(
      all,
    );
    expect(
      await eventRepository.countEvents({ person: labels.person }),
    ).toBeGreaterThan(0);
    expect(await eventRepository.countEvents({ person: "%" })).toBe(0);
  });
});
