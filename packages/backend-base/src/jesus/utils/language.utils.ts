import type { db } from "../../shared/shared.plugin";

const DEFAULT_LANGUAGE = "en-US";
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export async function resolveLanguage(
  database: db,
  options: {
    lang?: string;
    bibleVersion?: string;
    currentUserId?: string | null;
  },
): Promise<string> {
  if (options.lang && LANGUAGE_CODE.test(options.lang)) return options.lang;
  let languageCode = DEFAULT_LANGUAGE;
  const connection = database.getOrCreateConnection();

  if (options.bibleVersion) {
    const version = await connection
      .selectFrom("bible_versions")
      .where("version_key", "=", options.bibleVersion)
      .select("language_code")
      .executeTakeFirst();

    if (version?.language_code) languageCode = version.language_code;
  }

  if (options.currentUserId) {
    const user = await connection
      .selectFrom("user")
      .where("id", "=", options.currentUserId)
      .select("preferred_language")
      .executeTakeFirst();

    if (user?.preferred_language) languageCode = user.preferred_language;
  }

  return languageCode;
}
