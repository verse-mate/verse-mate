import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

/**
 * Correct UKRKL metadata.
 *
 * 20260525000000-extend-bible-versions.ts seeded UKRKL with
 *   version_name        = "Переклад Куліша"
 *   testament_coverage  = "nt"
 *
 * …because the original Куліш NT shipped in 1880. But the full Kulish
 * Bible (NT + OT, completed by Puluj and Nechuy-Levytskyi, published 1903)
 * is what's actually in the verses table — `GET /bible/book/1/1?bible_version=UKRKL`
 * returns Ukrainian Genesis 1:1 ("У початку сотворив Бог небо та землю.").
 *
 * Set coverage to "full" so the discovery endpoint stops claiming NT-only.
 * Refresh the version_name + attribution to the canonical full-Bible form
 * (the live API was emitting "Переклад Куліша (НЗ)" with NT-only credit —
 * that's wrong if OT verses exist).
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db
    .updateTable("bible_versions")
    .set({
      version_name: "Переклад Куліша",
      testament_coverage: "full",
      attribution:
        "Біблія, переклад П. Куліша, І. Пулюя та І. Нечуя-Левицького (1903). Public domain.",
    })
    .where("version_key", "=", "UKRKL")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db
    .updateTable("bible_versions")
    .set({
      version_name: "Переклад Куліша",
      testament_coverage: "nt",
      attribution: null,
    })
    .where("version_key", "=", "UKRKL")
    .execute();
}
