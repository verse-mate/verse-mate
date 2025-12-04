import type { Kysely } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createType("sso_provider_enum")
    .asEnum(["google", "apple"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropType("sso_provider_enum").execute();
}
