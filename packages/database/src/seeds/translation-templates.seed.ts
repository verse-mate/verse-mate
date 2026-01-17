import type { Kysely } from "kysely";
import type Database from "../models/Database";

export async function seedTranslationTemplates(db: Kysely<Database>) {
  console.log("Seeding translation templates...");

  const templates = [
    {
      language_code: "uk",
      type: "summary",
      title_template: "# Огляд {Book} {chapterNumber}",
    },
    {
      language_code: "uk",
      type: "byline",
      title_template: "# Порядковий аналіз {Book} {chapterNumber}",
    },
    {
      language_code: "uk",
      type: "detailed",
      title_template: "# Поглиблений аналіз {Book} {chapterNumber}",
    },
    // Add other languages here as needed
  ];

  for (const template of templates) {
    await db
      .insertInto("translation_templates")
      .values(template)
      .onConflict((oc) =>
        oc.columns(["language_code", "type"]).doUpdateSet({
          title_template: template.title_template,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  console.log("Successfully seeded translation templates.");
}
