import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("prompts").dropColumn("type").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("prompts")
    .addColumn("type", sql`explanation_type_enum`, (col) =>
      col.notNull().defaultTo("summary"),
    )
    .execute();
}
