import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("user")
    .addColumn("picture_source", "varchar(20)", (col) =>
      col.check(sql`picture_source IN ('google', 'apple', 'custom')`),
    )
    .execute();

  // Add comment for documentation
  await sql`COMMENT ON COLUMN "user"."picture_source" IS 'Source of profile picture: google, apple, or custom'`.execute(
    db,
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("user").dropColumn("picture_source").execute();
}
