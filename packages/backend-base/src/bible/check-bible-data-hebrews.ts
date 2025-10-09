import { parseBibleData } from "./bible";

async function checkBibleDataHebrews() {
  console.log("📖 Checking Hebrews chapters in Bible data files...\n");

  try {
    const metadataFile = Bun.file(`${import.meta.dir}/data/key_english.json`);
    const bibleFile = Bun.file(`${import.meta.dir}/data/NASB1995.json`);
    const bible = await parseBibleData(bibleFile, metadataFile);

    // Find Hebrews in parsed Bible data
    const hebrews = bible.books.find((b) => b.bookId === 58);
    if (!hebrews) {
      console.error("❌ Hebrews book not found in Bible data");
      return;
    }

    console.log("📚 Found Hebrews in Bible data:");
    console.log(`   Book ID: ${hebrews.bookId}`);
    console.log(`   Book Name: ${hebrews.name}`);
    console.log(`   Total Chapters: ${hebrews.chapters.length}\n`);

    console.log("📖 Hebrews chapters in Bible data:");
    hebrews.chapters.forEach((chapter) => {
      console.log(
        `   Chapter ${chapter.chapterId} - ${chapter.verses.length} verses`,
      );
    });

    console.log("\n📊 Summary:");
    console.log(
      `   - Bible data has ${hebrews.chapters.length} Hebrews chapters`,
    );
    console.log("   - Database appears to have only 6 chapters");
    console.log(
      `   - Missing chapters: ${hebrews.chapters.length > 6 ? `7-${hebrews.chapters.length}` : "none"}`,
    );
  } catch (error) {
    console.error("❌ Error checking Bible data:", error);
  }
}

// Run the check if this script is executed directly
if (import.meta.main) {
  checkBibleDataHebrews()
    .then(() => {
      console.log("\n✅ Bible data check complete");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Failed to check Bible data:", error);
      process.exit(1);
    });
}
