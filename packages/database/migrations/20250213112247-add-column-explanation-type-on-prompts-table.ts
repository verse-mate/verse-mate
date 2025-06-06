import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_enabled_status`.compile(db),
  );

  await db.schema
    .alterTable("prompts")
    .addColumn("type", sql`explanation_type_enum`, (col) =>
      col.notNull().defaultTo("summary"),
    )
    .execute();

  await db.executeQuery(
    sql`
      CREATE UNIQUE INDEX unique_active_status_per_type
      ON prompts (type)
      WHERE status = 'active'
    `.compile(db),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_status_per_type`.compile(db),
  );

  await db.schema.alterTable("prompts").dropColumn("type").execute();

  await db.executeQuery(
    sql`
      CREATE UNIQUE INDEX unique_enabled_status
      ON prompts (status)
      WHERE status = 'active'
    `.compile(db),
  );
}
