import { describe, expect, it } from "bun:test";
import type { db } from "../../shared/shared.plugin";
import { resolveLanguage } from "../utils/language.utils";

const fakeDb = (rows: { bible_versions?: string; user?: string }) =>
  ({
    getOrCreateConnection: () => ({
      selectFrom: (table: "bible_versions" | "user") => ({
        where: () => ({
          select: () => ({
            executeTakeFirst: async () =>
              table === "bible_versions"
                ? rows.bible_versions && { language_code: rows.bible_versions }
                : rows.user && { preferred_language: rows.user },
          }),
        }),
      }),
    }),
  }) as unknown as db;

describe("resolveLanguage", () => {
  it("serves an explicit lang ahead of the version and the saved preference", async () => {
    const language = await resolveLanguage(
      fakeDb({ bible_versions: "en-US", user: "de" }),
      { lang: "es-MX", bibleVersion: "NASB1995", currentUserId: "u1" },
    );

    expect(language).toBe("es-MX");
  });

  it("ignores a lang that is not a language code", async () => {
    const language = await resolveLanguage(fakeDb({ user: "de" }), {
      lang: "'; drop table",
      currentUserId: "u1",
    });

    expect(language).toBe("de");
  });

  it("keeps the saved preference when no lang is given", async () => {
    const language = await resolveLanguage(
      fakeDb({ bible_versions: "en-US", user: "de" }),
      { bibleVersion: "NASB1995", currentUserId: "u1" },
    );

    expect(language).toBe("de");
  });
});
