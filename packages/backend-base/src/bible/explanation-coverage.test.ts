import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import Backend from "./bible.plugin";

const LANG_A = "zz-CovA";
const LANG_B = "zz-CovB";

type Coverage = {
  languages: Record<string, { bookId: number; chapters: number[] }[]>;
};

describe("GET /bible/explanations/coverage", () => {
  const db = () => Backend.store.db.getOrCreateConnection();
  const inserted: number[] = [];

  const chapterId = async (bookId: number, chapterNumber: number) =>
    (
      await db()
        .selectFrom("chapters")
        .select("chapter_id")
        .where("book_id", "=", bookId)
        .where("chapter_number", "=", chapterNumber)
        .executeTakeFirstOrThrow()
    ).chapter_id;

  const seed = async (
    bookId: number,
    chapterNumber: number,
    language: string,
    type: ExplanationTypeEnum,
    isActive = true,
  ) => {
    const row = await db()
      .insertInto("explanations")
      .values({
        type,
        explanation: "coverage test",
        chapter_id: await chapterId(bookId, chapterNumber),
        version: 1,
        is_active: isActive,
        created_by_admin: true,
        language_code: language,
      })
      .returning("explanation_id")
      .executeTakeFirstOrThrow();
    inserted.push(row.explanation_id);
  };

  beforeAll(async () => {
    await seed(43, 3, LANG_A, ExplanationTypeEnum.summary);
    await seed(43, 1, LANG_A, ExplanationTypeEnum.summary);
    await seed(1, 1, LANG_A, ExplanationTypeEnum.summary);
    await seed(43, 4, LANG_A, ExplanationTypeEnum.byline);
    await seed(43, 3, LANG_B, ExplanationTypeEnum.summary);
    await seed(43, 5, LANG_B, ExplanationTypeEnum.summary, false);
  });

  afterAll(async () => {
    if (inserted.length)
      await db()
        .deleteFrom("explanations")
        .where("explanation_id", "in", inserted)
        .execute();
    Backend.store.db.closeConnection();
    Backend.store.cache.disconnect();
  });

  const fetchCoverage = async () => {
    const response = await Backend.handle(
      new Request("http://localhost/bible/explanations/coverage"),
    );
    return { response, body: (await response.json()) as Coverage };
  };

  it("lists, per language, the chapters with an active summary, sorted", async () => {
    const { response, body } = await fetchCoverage();

    expect(response.status).toBe(200);
    expect(body.languages[LANG_A]).toEqual([
      { bookId: 1, chapters: [1] },
      { bookId: 43, chapters: [1, 3] },
    ]);
    expect(body.languages[LANG_B]).toEqual([{ bookId: 43, chapters: [3] }]);
  });

  it("is public and cacheable for an hour", async () => {
    const { response } = await fetchCoverage();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});
