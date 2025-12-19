import type { Kysely } from "kysely";
import type Database from "../models/Database";
import introsData from "./data/book-intros.json";

interface IntroData {
  book_id?: number;
  full_intro_text?: string;
  [key: string]: unknown;
}

export async function seedBookIntroductions(
  db: Omit<Kysely<Database>, "destroy">,
) {
  console.log("Seeding book introductions...");

  const typedIntrosData = introsData as Record<string, IntroData>;

  for (const [bookId, intro] of Object.entries(typedIntrosData)) {
    const resolvedBookId = intro.book_id ?? Number(bookId);

    const payload: IntroData & { book_id: number } = {
      ...intro,
      book_id: resolvedBookId,
    };

    await db
      .insertInto("book_introductions")
      .values(payload as any)
      .onConflict((oc) =>
        oc
          .columns(["book_id", "language_code", "version"])
          .doUpdateSet(payload as any),
      )
      .execute();

    console.log(`  ✓ Seeded introduction for book ${bookId}`);
  }

  console.log("✅ Book introductions seeded successfully");
}
