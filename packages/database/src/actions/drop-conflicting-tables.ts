import { db } from "../database";

async function dropConflictingTables() {
  console.log("Attempting to drop conflicting tables...");

  try {
    // Drop user_viewed_book_introductions if exists
    console.log("Dropping user_viewed_book_introductions if exists...");
    await db
      .getOrCreateConnection()
      .schema.dropTable("user_viewed_book_introductions")
      .ifExists()
      .cascade()
      .execute();
    console.log("Dropped user_viewed_book_introductions.");

    // Drop book_introductions if exists
    console.log("Dropping book_introductions if exists...");
    await db
      .getOrCreateConnection()
      .schema.dropTable("book_introductions")
      .ifExists()
      .cascade()
      .execute();
    console.log("Dropped book_introductions.");
  } catch (error) {
    console.error("Failed to drop tables:", error);
    process.exit(1);
  } finally {
    await db.closeConnection();
  }
}

dropConflictingTables();
