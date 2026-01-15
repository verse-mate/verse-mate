import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type Database from "./models/Database";

// SSL config for DigitalOcean managed databases (self-signed certs)
const getSSLConfig = () => {
  const url = process.env.POSTGRES_URL || "";
  if (url.includes("sslmode=require")) {
    return { rejectUnauthorized: false };
  }
  return false;
};

let connection: Kysely<Database> | undefined;

export const db = {
  getOrCreateConnection(): Omit<Kysely<Database>, "destroy"> {
    if (!connection) {
      const dialect = new PostgresDialect({
        pool: new Pool({
          connectionString: process.env.POSTGRES_URL,
          max: 10,
          ssl: getSSLConfig(),
        }),
      });

      // Database interface is passed to Kysely's constructor, and from now on, Kysely
      // knows your database structure.
      // Dialect is passed to Kysely's constructor, and from now on, Kysely knows how
      // to communicate with your database.
      connection = new Kysely<Database>({
        dialect,
      });
    }

    return connection;
  },
  closeConnection() {
    connection?.destroy();
    connection = undefined;
  },
};
