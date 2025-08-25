import { db } from "database";

async function checkHebrewsChapters() {
  console.log("🔍 Checking Hebrews chapters in database...\n");

  const connection = db.getOrCreateConnection();

  try {
    // Get all Hebrews chapters
    const chapters = await connection
      .selectFrom("chapters")
      .innerJoin("books", "chapters.book_id", "books.book_id")
      .select([
        "chapters.chapter_id",
        "chapters.chapter_number",
        "books.name as book_name",
        "books.book_id",
      ])
      .where("books.book_id", "=", 58) // Hebrews book ID
      .orderBy("chapters.chapter_number", "asc")
      .execute();

    console.log(`📊 Found ${chapters.length} Hebrews chapters in database:`);
    chapters.forEach((chapter) => {
      console.log(
        `   Chapter ${chapter.chapter_number} (ID: ${chapter.chapter_id})`,
      );
    });

    // Also check if there are more Hebrews chapters that might exist
    const allBooks = await connection
      .selectFrom("books")
      .select(["book_id", "name"])
      .where("name", "like", "%Hebrews%")
      .execute();

    console.log(`\n📚 Books matching 'Hebrews': ${allBooks.length}`);
    allBooks.forEach((book) => {
      console.log(`   ${book.name} (ID: ${book.book_id})`);
    });
  } catch (error) {
    console.error("❌ Error checking chapters:", error);
  }
}

// Run the check if this script is executed directly
if (import.meta.main) {
  checkHebrewsChapters()
    .then(() => {
      console.log("\n✅ Chapter check complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Failed to check chapters:", error);
      process.exit(1);
    });
}
