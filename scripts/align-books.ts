import "dotenv/config";
import { db } from "@verse-mate/database";
import TestamentEnum from "../packages/database/src/models/public/TestamentEnum";

const STANDARD_BOOKS: Record<number, { name: string; testament: TestamentEnum }> =
  {
    1: { name: "Genesis", testament: TestamentEnum.OT },
    2: { name: "Exodus", testament: TestamentEnum.OT },
    3: { name: "Leviticus", testament: TestamentEnum.OT },
    4: { name: "Numbers", testament: TestamentEnum.OT },
    5: { name: "Deuteronomy", testament: TestamentEnum.OT },
    6: { name: "Joshua", testament: TestamentEnum.OT },
    7: { name: "Judges", testament: TestamentEnum.OT },
    8: { name: "Ruth", testament: TestamentEnum.OT },
    9: { name: "1 Samuel", testament: TestamentEnum.OT },
    10: { name: "2 Samuel", testament: TestamentEnum.OT },
    11: { name: "1 Kings", testament: TestamentEnum.OT },
    12: { name: "2 Kings", testament: TestamentEnum.OT },
    13: { name: "1 Chronicles", testament: TestamentEnum.OT },
    14: { name: "2 Chronicles", testament: TestamentEnum.OT },
    15: { name: "Ezra", testament: TestamentEnum.OT },
    16: { name: "Nehemiah", testament: TestamentEnum.OT },
    17: { name: "Esther", testament: TestamentEnum.OT },
    18: { name: "Job", testament: TestamentEnum.OT },
    19: { name: "Psalms", testament: TestamentEnum.OT },
    20: { name: "Proverbs", testament: TestamentEnum.OT },
    21: { name: "Ecclesiastes", testament: TestamentEnum.OT },
    22: { name: "Song of Solomon", testament: TestamentEnum.OT },
    23: { name: "Isaiah", testament: TestamentEnum.OT },
    24: { name: "Jeremiah", testament: TestamentEnum.OT },
    25: { name: "Lamentations", testament: TestamentEnum.OT },
    26: { name: "Ezekiel", testament: TestamentEnum.OT },
    27: { name: "Daniel", testament: TestamentEnum.OT },
    28: { name: "Hosea", testament: TestamentEnum.OT },
    29: { name: "Joel", testament: TestamentEnum.OT },
    30: { name: "Amos", testament: TestamentEnum.OT },
    31: { name: "Obadiah", testament: TestamentEnum.OT },
    32: { name: "Jonah", testament: TestamentEnum.OT },
    33: { name: "Micah", testament: TestamentEnum.OT },
    34: { name: "Nahum", testament: TestamentEnum.OT },
    35: { name: "Habakkuk", testament: TestamentEnum.OT },
    36: { name: "Zephaniah", testament: TestamentEnum.OT },
    37: { name: "Haggai", testament: TestamentEnum.OT },
    38: { name: "Zechariah", testament: TestamentEnum.OT },
    39: { name: "Malachi", testament: TestamentEnum.OT },
    40: { name: "Matthew", testament: TestamentEnum.NT },
    41: { name: "Mark", testament: TestamentEnum.NT },
    42: { name: "Luke", testament: TestamentEnum.NT },
    43: { name: "John", testament: TestamentEnum.NT },
    44: { name: "Acts", testament: TestamentEnum.NT },
    45: { name: "Romans", testament: TestamentEnum.NT },
    46: { name: "1 Corinthians", testament: TestamentEnum.NT },
    47: { name: "2 Corinthians", testament: TestamentEnum.NT },
    48: { name: "Galatians", testament: TestamentEnum.NT },
    49: { name: "Ephesians", testament: TestamentEnum.NT },
    50: { name: "Philippians", testament: TestamentEnum.NT },
    51: { name: "Colossians", testament: TestamentEnum.NT },
    52: { name: "1 Thessalonians", testament: TestamentEnum.NT },
    53: { name: "2 Thessalonians", testament: TestamentEnum.NT },
    54: { name: "1 Timothy", testament: TestamentEnum.NT },
    55: { name: "2 Timothy", testament: TestamentEnum.NT },
    56: { name: "Titus", testament: TestamentEnum.NT },
    57: { name: "Philemon", testament: TestamentEnum.NT },
    58: { name: "Hebrews", testament: TestamentEnum.NT },
    59: { name: "James", testament: TestamentEnum.NT },
    60: { name: "1 Peter", testament: TestamentEnum.NT },
    61: { name: "2 Peter", testament: TestamentEnum.NT },
    62: { name: "1 John", testament: TestamentEnum.NT },
    63: { name: "2 John", testament: TestamentEnum.NT },
    64: { name: "3 John", testament: TestamentEnum.NT },
    65: { name: "Jude", testament: TestamentEnum.NT },
    66: { name: "Revelation", testament: TestamentEnum.NT },
  };

async function alignBooks() {
  console.log("🔄 Aligning 'books' table to standard IDs...");
  const connection = db.getOrCreateConnection();

  try {
    // 1. Rename all to TEMP names first to avoid Unique Constraint violations
    console.log("🛠️  Step 1: Assigning temporary names to avoid collisions...");
    for (let id = 1; id <= 66; id++) {
      await connection
        .updateTable("books")
        .set({ name: `TEMP_RENAME_${id}` })
        .where("book_id", "=", id)
        .execute();
    }

    // 2. Assign the correct names
    console.log("🛠️  Step 2: Assigning correct standard names...");
    for (const [idStr, data] of Object.entries(STANDARD_BOOKS)) {
      const id = Number(idStr);

      await connection
        .updateTable("books")
        .set({
          name: data.name,
          testament: data.testament,
        })
        .where("book_id", "=", id)
        .execute();

      if (id % 10 === 0 || id === 66) {
        console.log(`   Aligned ${id}/66 books...`);
      }
    }
    console.log("\n✅ SUCCESS: 'books' table names now match standard IDs.");
  } catch (error) {
    console.error("❌ Failed to align books:", error);
  } finally {
    process.exit(0);
  }
}

alignBooks();