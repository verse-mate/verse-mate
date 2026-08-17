import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { main as runSeedScript } from "../../backend-base/src/bible/seed";
import type Database from "./models/Database";
import { projectJesusEventsFromEntries } from "./seeds/jesus-events.project";
import { seedJesus } from "./seeds/jesus.seed";
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
  // Depends on `books` being populated by runSeedScript above.
  await seedJesus(db);

  // The event graph is derived from the entries seeded above, so it has to be
  // rebuilt here rather than left to the migration that introduced it: on any
  // database that was empty when that migration ran — which is every fresh
  // environment, since the container entrypoint runs `migrate-deploy` and not
  // `db:seed` — it found no corpus and will never run again. The projection is
  // idempotent, so re-seeding adds only what is new.
  const projected = await projectJesusEventsFromEntries(db);
  console.log(
    `Jesus event graph: ${projected.events} events, ${projected.facets} facets, ${projected.passages} passages`,
  );

  db.destroy();
}

runSeed();
