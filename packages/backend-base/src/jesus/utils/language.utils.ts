import type { db } from "../../shared/shared.plugin";

const DEFAULT_LANGUAGE = "en-US";

/**
 * Resolve which language to serve Jesus content in.
 *
 * Precedence — Bible version's language first, then a signed-in user's
 * explicit preference. Identical to the rule the topics plugin applies inline;
 * factored out here because every Jesus route needs it.
 */
export async function resolveLanguage(
  database: db,
  options: { bibleVersion?: string; currentUserId?: string | null },
): Promise<string> {
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
