import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { main as runSeedScript } from "../../backend-base/src/bible/seed";
import type Database from "./models/Database";
import { seedTranslationTemplates } from "./seeds/translation-templates.seed";
import { getCleanConnectionString, getSSLConfig } from "./utils/ssl-config";

async function runSeed() {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: getCleanConnectionString(),
        ssl: getSSLConfig(),
      }),
    }),
  });

  // Insert records here
  await runSeedScript();
  await seedTranslationTemplates(db);

  db.destroy();
}

runSeed();
