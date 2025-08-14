import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("user")
    .addColumn("is_admin", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("user").dropColumn("is_admin").execute();
}
