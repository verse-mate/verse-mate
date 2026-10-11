import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { faker } from "@faker-js/faker";
import { db as Database } from "database";
import { LemmaRepository } from "./lemma.repository";

const strongs = `Z${faker.string.numeric(7)}`;

describe("LemmaRepository.getLemma", () => {
  const repository = new LemmaRepository(Database);
  const conn = () => Database.getOrCreateConnection();
  const englishGloss = faker.lorem.words(2);
  const spanishGloss = faker.lorem.words(2);

  beforeAll(async () => {
    await conn()
      .insertInto("lemmas")
      .values({
        strongs,
        lemma: faker.lorem.word(),
        loaded: true,
        basic_gloss: englishGloss,
      })
      .execute();
    await conn()
      .insertInto("lemma_translations")
      .values({
        strongs,
        language_code: "es",
        translated_basic_gloss: spanishGloss,
        is_active: true,
      })
      .execute();
  });

  afterAll(async () => {
    await conn().deleteFrom("lemmas").where("strongs", "=", strongs).execute();
    Database.closeConnection();
  });

  it("returns the translation for a regional variant of the language", async () => {
    const card = await repository.getLemma(strongs, "es-MX");
    expect(card?.basic_gloss).toBe(spanishGloss);
    expect(card?.language_code).toBe("es");
  });

  it("falls back to English when the language has no translation", async () => {
    const card = await repository.getLemma(strongs, "fr");
    expect(card?.basic_gloss).toBe(englishGloss);
    expect(card?.language_code).toBe("en");
  });

  it("falls back to English for a code that is not a language code", async () => {
    const card = await repository.getLemma(strongs, "es' OR 'x");
    expect(card?.basic_gloss).toBe(englishGloss);
    expect(card?.language_code).toBe("en");
  });
});
