import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type Database from "./models/Database";

async function verifyTopics() {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString:
          "postgresql://postgres_user:postgres_password@localhost:5432/postgres_db",
      }),
    }),
  });

  try {
    // Check if topics exist
    const topics = await db.selectFrom("topics").selectAll().execute();

    console.log(`Found ${topics.length} topics in the database:`);
    topics.forEach((topic) => {
      console.log(`- ${topic.name} (${topic.category})`);
    });

    // Check categories
    const categories = await db
      .selectFrom("topics")
      .select("category")
      .distinct()
      .execute();

    console.log("\nAvailable categories:");
    categories.forEach((cat) => {
      console.log(`- ${cat.category}`);
    });
  } catch (error) {
    console.error("Error verifying topics:", error);
  } finally {
    await db.destroy();
  }
}

verifyTopics();
