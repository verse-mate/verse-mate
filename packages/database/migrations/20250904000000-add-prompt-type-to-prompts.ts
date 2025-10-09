import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

enum PromptStatusEnum {
  active = "active",
  inactive = "inactive",
}

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("prompts")
    .addColumn("prompt_type", "varchar(50)", (col) =>
      col.notNull().defaultTo("system"),
    )
    .execute();

  await db
    .insertInto("prompts")
    .values({
      prompt: "Rephrase the following text:",
      status: PromptStatusEnum.active,
      prompt_type: "rephrase",
    })
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("prompts").dropColumn("prompt_type").execute();
  await db
    .deleteFrom("prompts")
    .where("prompt_type", "=", "rephrase")
    .execute();
}
