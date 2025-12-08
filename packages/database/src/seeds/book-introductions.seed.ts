import type { Kysely } from "kysely";
import type Database from "../models/Database";
import introsData from "./data/book-intros.json";

export async function seedBookIntroductions(
  db: Omit<Kysely<Database>, "destroy">,
) {
  console.log("Seeding book introductions...");

  for (const [bookId, intro] of Object.entries(introsData)) {
    await db
      .insertInto("book_introductions")
      .values(intro)
      .onConflict((oc) =>
        oc.columns(["book_id", "language_code", "version"]).doUpdateSet(intro),
      )
      .execute();

    console.log(`  ✓ Seeded introduction for book ${bookId}`);
  }

  console.log("✅ Book introductions seeded successfully");
}
