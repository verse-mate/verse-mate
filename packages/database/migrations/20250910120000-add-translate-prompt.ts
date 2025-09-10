import type { Kysely } from "kysely";
import { sql } from "kysely";
import PromptStatusEnum from "../src/models/public/PromptStatusEnum";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // To avoid issues with primary key sequences, we'll manually determine the next ID.
  const maxIdResult = await db
    .selectFrom("prompts")
    .select(sql`max(prompt_id)`.as("max_id"))
    .executeTakeFirst();

  const nextId = ((maxIdResult?.max_id as any) || 0) + 1;

  await db
    .insertInto("prompts")
    .values({
      prompt_id: nextId,
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
