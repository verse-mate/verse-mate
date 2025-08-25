import { db } from "database";

async function checkHebrewsExplanations() {
  console.log("🔍 Checking Hebrews explanations in database...\n");

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

    // Group by chapter
    const byChapter: Record<number, any[]> = {};
    explanations.forEach((exp) => {
      if (!byChapter[exp.chapter_number]) {
        byChapter[exp.chapter_number] = [];
      }
      byChapter[exp.chapter_number].push(exp);
    });

    // Display each chapter's explanations
    for (const [chapterNum, chapterExplanations] of Object.entries(byChapter)) {
      console.log(`\n📖 HEBREWS ${chapterNum}:`);
      console.log(`   Found ${chapterExplanations.length} explanations\n`);

      chapterExplanations.forEach((exp) => {
        console.log(
          `   📝 ${exp.type.toUpperCase()} (ID: ${exp.explanation_id})`,
        );
        console.log(`   Preview: ${exp.explanation.substring(0, 150)}...`);
        console.log(`   Length: ${exp.explanation.length} characters\n`);
      });
    }

    // Summary statistics
    const typeCount = explanations.reduce(
      (acc, exp) => {
        acc[exp.type] = (acc[exp.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    console.log("📊 SUMMARY STATISTICS:");
    console.log(`   Total explanations: ${explanations.length}`);
    Object.entries(typeCount).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
  } catch (error) {
    console.error("❌ Error checking explanations:", error);
  }
}

// Run the check if this script is executed directly
if (import.meta.main) {
  checkHebrewsExplanations()
    .then(() => {
      console.log("\n✅ Database check complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Failed to check database:", error);
      process.exit(1);
    });
}
