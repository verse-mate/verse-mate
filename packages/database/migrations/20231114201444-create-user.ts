import { type Kysely, sql } from "kysely";

import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("user")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("email", "varchar(250)", (col) => col.notNull().unique())
    .addColumn("emailVerified", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("password", "varchar(250)", (col) => col.notNull())
    .addColumn("firstName", "varchar(100)", (col) => col.notNull())
    .addColumn("lastName", "varchar(100)", (col) => col.notNull())
    .addColumn("imageSrc", "varchar(2000)")
    .addColumn("createdAt", "timestamp", (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("user").execute();
}
