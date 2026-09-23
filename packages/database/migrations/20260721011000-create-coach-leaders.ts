import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible-Coach portal: admin-added leaders.
 *
 * The coach roster is primarily served from the bundled coaching-pipeline
 * dataset, a compiled-in bundle at the time, this same table since (change:
 * port-coach-pipeline, task 3.1). This table lets a program
 * admin add a brand-new leader by email before any report exists, the row is
 * merged into the roster (0 sessions) and, once a VerseMate account with the
 * same email signs in, that account becomes a coachee. One row per email.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_leaders table...");

  await db.schema
    .createTable("coach_leaders")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    // Stored lowercased, the join key to a VerseMate account's email.
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
