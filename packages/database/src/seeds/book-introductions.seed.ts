import type { Kysely } from "kysely";
import type Database from "../models/Database";

export async function seedBookIntroductions(
  db: Omit<Kysely<Database>, "destroy">,
) {
  const introsData = require("./data/book-intros.json");

  console.log("Seeding book introductions...");

  for (const [bookId, intro] of Object.entries(introsData)) {
    // book_introductions table type may not be generated yet, using any cast
    await (db as any)
      .insertInto("book_introductions")
      .values(intro as any)
      .onConflict((oc: any) =>
        oc.columns(["book_id", "language_code", "version"]).doNothing(),
      )
      .execute();

    console.log(`  ✓ Seeded introduction for book ${bookId}`);
  }

  console.log("✅ Book introductions seeded successfully");
}
