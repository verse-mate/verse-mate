import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Make password column nullable to support SSO-only users
  await sql`ALTER TABLE "user" ALTER COLUMN "password" DROP NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  // First, update any null passwords to a placeholder (so we can add NOT NULL constraint back)
  // In production, this would need careful handling
  await sql`UPDATE "user" SET "password" = '' WHERE "password" IS NULL`.execute(
    db,
  );

  // Restore NOT NULL constraint
  await sql`ALTER TABLE "user" ALTER COLUMN "password" SET NOT NULL`.execute(
    db,
  );
}
