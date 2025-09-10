import type { Kysely } from "kysely";
import { sql } from "kysely";
import PromptStatusEnum from "../src/models/public/PromptStatusEnum";

import type Database from "../src/models/Database";

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
