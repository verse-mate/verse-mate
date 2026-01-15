import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  FileMigrationProvider,
  Kysely,
  Migrator,
  PostgresDialect,
} from "kysely";
import { Pool } from "pg";

import type Database from "../models/Database";

// SSL config for DigitalOcean managed databases (self-signed certs)
const getSSLConfig = () => {
  const url = process.env.POSTGRES_URL || "";
  if (url.includes("sslmode=require")) {
    return { rejectUnauthorized: false };
  }
  return false;
};

async function migrateDown(migrationFolder: string) {
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: getSSLConfig(),
      }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // This needs to be an absolute path.
      migrationFolder,
    }),
  });

  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was reverted successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to reverted migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("failed to reverted");
    console.error(error);
    process.exit(1);
  }

  await db.destroy();
}

export { migrateDown };
