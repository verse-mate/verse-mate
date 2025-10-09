import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("favorites").dropColumn("message_id").execute();
}

export async function down(_db: Kysely<Database>): Promise<void> {
  // It is not possible to revert this, as will lost any data relation to it
}
