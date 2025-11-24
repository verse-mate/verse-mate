import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding new colors to highlight_color_enum...");

  // Add red, teal, and brown to the highlight_color_enum
  await db.executeQuery(
    sql`ALTER TYPE highlight_color_enum ADD VALUE IF NOT EXISTS 'red'`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`ALTER TYPE highlight_color_enum ADD VALUE IF NOT EXISTS 'teal'`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`ALTER TYPE highlight_color_enum ADD VALUE IF NOT EXISTS 'brown'`.compile(
      db,
    ),
  );

  console.log(
    "Successfully added red, teal, and brown to highlight_color_enum.",
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log(
    "WARNING: Cannot remove values from PostgreSQL enum types directly.",
  );
  console.log(
    "To rollback this migration, you would need to recreate the enum type.",
  );
  console.log(
    "This is a complex operation that requires recreating dependent tables.",
  );
  console.log("Manual intervention required for rollback.");
}
