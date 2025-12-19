import type { Kysely } from "kysely";
import type Database from "../models/Database";
import introsData from "./data/book-intros.json";

interface IntroData {
  book_id?: number;
  full_intro_text?: string;
  [key: string]: unknown;
}

const CANONICAL_BOOK_IDS: Record<string, number> = {
  Genesis: 1,
  Exodus: 2,
  Leviticus: 3,
  Numbers: 4,
  Deuteronomy: 5,
  Joshua: 6,
  Judges: 7,
  Ruth: 8,
  "1 Samuel": 9,
  "2 Samuel": 10,
  "1 Kings": 11,
  "2 Kings": 12,
  "1 Chronicles": 13,
  "2 Chronicles": 14,
  Ezra: 15,
  Nehemiah: 16,
  Esther: 17,
  Job: 18,
  Psalms: 19,
  Proverbs: 20,
  Ecclesiastes: 21,
  "Song of Solomon": 22,
  Isaiah: 23,
  Jeremiah: 24,
  Lamentations: 25,
  Ezekiel: 26,
  Daniel: 27,
  Hosea: 28,
  Joel: 29,
  Amos: 30,
  Obadiah: 31,
  Jonah: 32,
  Micah: 33,
  Nahum: 34,
  Habakkuk: 35,
  Zephaniah: 36,
  Haggai: 37,
  Zechariah: 38,
  Malachi: 39,
  Matthew: 40,
  Mark: 41,
  Luke: 42,
  John: 43,
  Acts: 44,
  Romans: 45,
  "1 Corinthians": 46,
  "2 Corinthians": 47,
  Galatians: 48,
  Ephesians: 49,
  Philippians: 50,
  Colossians: 51,
  "1 Thessalonians": 52,
  "2 Thessalonians": 53,
  "1 Timothy": 54,
  "2 Timothy": 55,
  Titus: 56,
  Philemon: 57,
  Hebrews: 58,
  James: 59,
  "1 Peter": 60,
  "2 Peter": 61,
  "1 John": 62,
  "2 John": 63,
  "3 John": 64,
  Jude: 65,
  Revelation: 66,
};

export async function seedBookIntroductions(
  db: Omit<Kysely<Database>, "destroy">,
) {
  console.log("Seeding book introductions...");

  const typedIntrosData = introsData as Record<string, IntroData>;

  for (const [bookId, intro] of Object.entries(typedIntrosData)) {
    const fullText = intro.full_intro_text;
    let canonicalBookId: number | undefined;

    if (typeof fullText === "string") {
      const firstLine = fullText.split("\n")[0] ?? "";
      const match = firstLine.match(/^#\s+Introduction to\s+(.+?)\s*\(/);
      if (match?.[1]) {
        const bookName = match[1].trim();
        canonicalBookId = CANONICAL_BOOK_IDS[bookName];
      }
    }

    if (!canonicalBookId) {
      canonicalBookId = intro.book_id ?? Number(bookId);
    }

    const payload: IntroData & { book_id: number } = {
      ...intro,
      book_id: canonicalBookId,
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
