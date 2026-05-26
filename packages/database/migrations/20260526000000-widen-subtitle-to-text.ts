import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

// Some translations (e.g. LSG) have section headings longer than the original
// varchar(250). Widen to text — matching verses.text — so multi-version ingest
// doesn't truncate or fail on long subtitles.
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("subtitles")
    .alterColumn("subtitle", (col) => col.setDataType("text"))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("subtitles")
    .alterColumn("subtitle", (col) => col.setDataType("varchar(250)"))
    .execute();
}
