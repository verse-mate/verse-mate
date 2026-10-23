import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_leaders table...");

  await db.schema
    .createTable("coach_leaders")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    // Stored lowercased — the join key to a VerseMate account's email.
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("group_name", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("coach_name", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("invited_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  console.log("coach_leaders table created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping coach_leaders table...");

  await db.schema.dropTable("coach_leaders").execute();

  console.log("coach_leaders table dropped successfully");
}
