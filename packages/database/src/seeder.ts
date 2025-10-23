import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { main as runSeedScript } from "../../backend-base/src/bible/seed";
import type Database from "./models/Database";

async function runSeed() {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: process.env.POSTGRES_URL,
      }),
    }),
  });

  // Insert records here
  await runSeedScript();

  db.destroy();
}

runSeed();
