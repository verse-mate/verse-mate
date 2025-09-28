import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

enum PromptStatusEnum {
  active = "active",
  inactive = "inactive",
}

export async function up(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("prompts")
    .values({
      prompt: "Translate the following text to {language}:",
      status: PromptStatusEnum.active,
      prompt_type: "translate",
    })
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db
    .deleteFrom("prompts")
    .where("prompt_type", "=", "translate")
    .execute();
}
