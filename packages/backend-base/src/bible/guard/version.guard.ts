import Elysia, { t } from "elysia";
import shared from "../../shared/shared.plugin";

export const versionGuard = new Elysia({ name: "versionGuard" })
  .use(shared)
  .guard({
    query: t.Object({
      versionKey: t.String({ minLength: 2 }),
    }),
  })
  .derive(async ({ query, store: { db } }) => {
    const version = await db
      .getOrCreateConnection()
      .selectFrom("bible_versions")
      .select(["id", "language_code", "version_key"])
      .where("version_key", "=", query.versionKey)
      .executeTakeFirst();

    if (!version) {
      // Bubble a 400 if invalid
      throw new Error("Invalid bible version");
    }

    return {
      versionId: version.id,
      versionKey: version.version_key,
      versionLang: version.language_code,
    };
  });
