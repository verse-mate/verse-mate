import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import type { Queue } from "bullmq";
import { db } from "database";
import ExplanationTypeEnum from "database/src/models/public/ExplanationTypeEnum";
import { BatchOperationService } from "./batch-operations.service";

const PHILEMON = 57;
const LANGUAGE = "zz-AutoTr";

describe("auto-translations after a batch completes", () => {
  const connection = () => db.getOrCreateConnection();
  let explanationId: number;

  beforeAll(async () => {
    const chapter = await connection()
      .selectFrom("chapters")
      .select("chapter_id")
      .where("book_id", "=", PHILEMON)
      .where("chapter_number", "=", 1)
      .executeTakeFirstOrThrow();
    const row = await connection()
      .insertInto("explanations")
      .values({
        type: ExplanationTypeEnum.summary,
        explanation: "auto-translate model test",
        chapter_id: chapter.chapter_id,
        version: 1,
        is_active: true,
        created_by_admin: true,
        language_code: LANGUAGE,
      })
      .returning("explanation_id")
      .executeTakeFirstOrThrow();
    explanationId = row.explanation_id;
  });

  afterAll(async () => {
    await connection()
      .deleteFrom("explanations")
      .where("explanation_id", "=", explanationId)
      .execute();
  });

  it("a batch stored with a retired model submits its translations on the replacement, since OpenAI refuses the retired one", async () => {
    const service = new BatchOperationService(db, {} as Queue, {} as Queue);
    const submit = spyOn(
      service as unknown as {
        createBookTranslateBatch: (...args: unknown[]) => Promise<unknown>;
      },
      "createBookTranslateBatch",
    ).mockResolvedValue({});

    await service.triggerAutoTranslations(
      [{ bookId: PHILEMON, chapterNumber: 1, type: "summary" }],
      "gpt-5-mini",
      null,
      16000,
    );

    const call = submit.mock.calls.find((args) => args[5] === LANGUAGE);
    expect(call?.[0]).toBe("gpt-6.1-terra");
  });
});
