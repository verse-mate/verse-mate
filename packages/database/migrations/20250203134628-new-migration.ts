import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createType("prompt_status_enum")
    .asEnum(["active", "inactive"])
    .execute();

  await db.schema
    .createTable("prompts")
    .addColumn("prompt_id", "serial", (col) => col.primaryKey())
    .addColumn("prompt", "text", (col) => col.notNull())
    .addColumn("status", sql`prompt_status_enum`, (col) => col.notNull())
    .execute();

  await db.executeQuery(
    sql`
      CREATE UNIQUE INDEX unique_enabled_status 
      ON prompts (status) 
      WHERE status = 'active'
    `.compile(db),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_enabled_status`.compile(db),
  );
  await db.schema.dropTable("prompts").execute();
  await db.schema.dropType("prompt_status_enum").execute();
}
