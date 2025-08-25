import { db } from "database";

async function viewHebrewsExplanations() {
  console.log("📖 Viewing full Hebrews explanations...\n");

  const connection = db.getOrCreateConnection();

  try {
    // Get all Hebrews explanations with chapter info
    const explanations = await connection
      .selectFrom("explanations")
      .innerJoin("chapters", "explanations.chapter_id", "chapters.chapter_id")
      .innerJoin("books", "chapters.book_id", "books.book_id")
      .select([
        "explanations.explanation_id",
        "explanations.type",
        "chapters.chapter_number",
        "books.name as book_name",
        "explanations.explanation",
      ])
      .where("books.book_id", "=", 58) // Hebrews book ID
      .orderBy("chapters.chapter_number", "asc")
      .orderBy("explanations.type", "asc")
      .execute();

    if (explanations.length === 0) {
      console.log("❌ No Hebrews explanations found in database");
      return;
    }

    console.log(`📊 Found ${explanations.length} explanations for Hebrews\n`);
    console.log("=" * 80);

    // Display each explanation in full
    explanations.forEach((exp, index) => {
      console.log(
        `\n📖 HEBREWS ${exp.chapter_number} - ${exp.type.toUpperCase()} (ID: ${exp.explanation_id})`,
      );
      console.log("=" * 80);
      console.log(exp.explanation);
      console.log("=" * 80);

      if (index < explanations.length - 1) {
        console.log(`\n${"-" * 80}\n`);
      }
    });
  } catch (error) {
    console.error("❌ Error viewing explanations:", error);
  }
}

// Run the viewer if this script is executed directly
if (import.meta.main) {
  viewHebrewsExplanations()
    .then(() => {
      console.log("\n✅ Explanation viewing complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Failed to view explanations:", error);
      process.exit(1);
    });
}
