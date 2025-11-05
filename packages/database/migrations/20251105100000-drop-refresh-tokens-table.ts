import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("refresh_tokens").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Re-create the table if rolling back
  // This is intentionally left empty as we are reverting the feature
}
