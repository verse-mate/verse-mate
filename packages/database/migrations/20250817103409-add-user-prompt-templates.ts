import type { Kysely } from "kysely";
import { sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("user_prompt_templates")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("template_name", "varchar(100)", (col) => col.notNull())
    .addColumn("explanation_type", "varchar(50)", (col) => col.notNull())
    .addColumn("prompt_template", "text", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("active"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  await db
    .insertInto("user_prompt_templates" as any)
    .values([
      {
        template_name: "summary_template",
        explanation_type: "summary",
        prompt_template:
          "Please provide a concise summary of the following biblical text in {language}. Focus on the main themes, key messages, and practical applications. Keep it brief but comprehensive, suitable for quick understanding and reflection.",
      },
      {
        template_name: "byline_template",
        explanation_type: "byline",
        prompt_template:
          "Please provide a detailed line-by-line explanation of the following biblical text in {language}. Break down each verse or significant phrase, explaining the meaning, context, and significance. Include historical background, cultural context, and theological insights where relevant.",
      },
      {
        template_name: "detailed_template",
        explanation_type: "detailed",
        prompt_template:
          "Please provide a comprehensive and detailed explanation of the following biblical text in {language}. Include thorough analysis of the passage, covering historical context, cultural background, theological significance, literary structure, and practical applications. Provide deep insights suitable for serious study and reflection.",
      },
    ])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("user_prompt_templates").execute();
}
