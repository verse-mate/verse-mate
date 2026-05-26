import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

type SeedVersion = {
  version_key: string;
  version_name: string;
  language_code: string;
  license: string;
  license_url: string | null;
  testament_coverage: "full" | "nt" | "ot";
};

// Curated, redistributable open-licensed versions (see verse-mate-web
// docs/multi-version-bible.md). Keys are canonical and must stay identical
// across build.py, bible-versions.ts, and this backend.
const VERSIONS: SeedVersion[] = [
  {
    version_key: "KJV",
    version_name: "King James (Authorized) Version",
    language_code: "en",
    license: "Public Domain",
    license_url: null,
    testament_coverage: "full",
  },
  {
    version_key: "SCH51",
    version_name: "Schlachter-Bibel 1951",
    language_code: "de",
    license: "CC BY 4.0",
    license_url: "https://creativecommons.org/licenses/by/4.0/",
    testament_coverage: "full",
  },
  {
    version_key: "LSG",
    version_name: "Louis Segond 1910",
    language_code: "fr",
    license: "Public Domain",
    license_url: null,
    testament_coverage: "full",
  },
  {
    version_key: "TGLULB",
    version_name: "Banal na Bibliya (ULB)",
    language_code: "tl",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
    testament_coverage: "full",
  },
  {
    version_key: "HCV",
    version_name: "Hindi Contemporary Version",
    language_code: "hi",
    license: "CC BY-SA 4.0",
    license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
    testament_coverage: "full",
  },
  {
    version_key: "BLIV",
    version_name: "Bíblia Livre",
    language_code: "pt",
    license: "CC BY 3.0",
    license_url: "https://creativecommons.org/licenses/by/3.0/",
    testament_coverage: "full",
  },
  {
    version_key: "RIV",
    version_name: "Riveduta 1927",
    language_code: "it",
    license: "Public Domain",
    license_url: null,
    testament_coverage: "full",
  },
  {
    version_key: "SYN",
    version_name: "Синодальный перевод",
    language_code: "ru",
    license: "Public Domain",
    license_url: null,
    testament_coverage: "full",
  },
  {
    version_key: "RVR09",
    version_name: "Reina-Valera 1909",
    language_code: "es",
    license: "Public Domain",
    license_url: null,
    testament_coverage: "full",
  },
  {
    version_key: "VDC",
    version_name: "Biblia Cornilescu 1924",
    language_code: "ro",
    license: "Public Domain",
    license_url: null,
    testament_coverage: "full",
  },
  {
    version_key: "UKRKL",
    version_name: "Переклад Куліша",
    language_code: "uk",
    license: "Public Domain",
    license_url: null,
    // New Testament only — missing OT books must degrade gracefully.
    testament_coverage: "nt",
  },
];

export async function up(db: Kysely<Database>): Promise<void> {
  // 1. License / attribution metadata on the versions table. Attribution is
  //    populated by the ingest loader from each version's manifest.json
  //    (the exact CC BY / CC BY-SA credit line), so it stays nullable here.
  await db.schema
    .alterTable("bible_versions")
    .addColumn("license", "varchar(50)")
    .addColumn("license_url", "varchar(255)")
    .addColumn("attribution", "text")
    .addColumn("testament_coverage", "varchar(8)", (col) =>
      col.notNull().defaultTo("full"),
    )
    .execute();

  // 2. Per-version localized book names (from USFM \h). books/chapters stay
  //    shared/global; only the display name varies by version.
  await db.schema
    .createTable("version_book_names")
    .addColumn("version_id", "uuid", (col) =>
      col.notNull().references("bible_versions.id").onDelete("cascade"),
    )
    .addColumn("book_id", "integer", (col) =>
      col.notNull().references("books.book_id").onDelete("cascade"),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addPrimaryKeyConstraint("version_book_names_pkey", [
      "version_id",
      "book_id",
    ])
    .execute();

  // 3. Seed curated version metadata (idempotent on the unique version_key).
  for (const v of VERSIONS) {
    await db
      .insertInto("bible_versions")
      .values({
        version_key: v.version_key,
        version_name: v.version_name,
        language_code: v.language_code,
        license: v.license,
        license_url: v.license_url,
        testament_coverage: v.testament_coverage,
        is_active: true,
      })
      .onConflict((oc) =>
        oc.column("version_key").doUpdateSet({
          version_name: v.version_name,
          language_code: v.language_code,
          license: v.license,
          license_url: v.license_url,
          testament_coverage: v.testament_coverage,
        }),
      )
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("version_book_names").execute();

  await db
    .deleteFrom("bible_versions")
    .where(
      "version_key",
      "in",
      VERSIONS.map((v) => v.version_key),
    )
    .execute();

  await db.schema
    .alterTable("bible_versions")
    .dropColumn("license")
    .dropColumn("license_url")
    .dropColumn("attribution")
    .dropColumn("testament_coverage")
    .execute();
}
