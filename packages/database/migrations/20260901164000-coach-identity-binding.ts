import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("coach_leaders")
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_leaders_user_uidx
    ON coach_leaders (user_id) WHERE user_id IS NOT NULL
  `.execute(db);
  await db.schema
    .alterTable("coach_admins")
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade"),
    )
    .execute();
  await sql`
    UPDATE coach_leaders l SET user_id = u.id
    FROM "user" u
    WHERE lower(u.email) = lower(l.email) AND u."emailVerified" = true
  `.execute(db);
  await sql`
    UPDATE coach_admins a SET user_id = u.id
    FROM "user" u
    WHERE lower(u.email) = lower(a.email) AND u."emailVerified" = true
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP INDEX IF EXISTS coach_leaders_user_uidx`.execute(db);
  await db.schema.alterTable("coach_admins").dropColumn("user_id").execute();
  await db.schema.alterTable("coach_leaders").dropColumn("user_id").execute();
}
