import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type Database from "./models/Database";
import { getCleanConnectionString, getSSLConfig } from "./utils/ssl-config";

let connection: Kysely<Database> | undefined;

export const db = {
  getOrCreateConnection(): Omit<Kysely<Database>, "destroy"> {
    if (!connection) {
      const dialect = new PostgresDialect({
        pool: new Pool({
          connectionString: getCleanConnectionString(),
          // The managed database allows 25 connections in total and the running
          // backend already holds a pool of these. A long CLI job that opens its
          // own default-sized pool can therefore exhaust the server: four
          // concurrent workers took every remaining slot and died with
          // "remaining connection slots are reserved for roles with the
          // SUPERUSER attribute". Such jobs set `PG_POOL_MAX=2` and share the
          // budget instead.
          max: Number(process.env.PG_POOL_MAX ?? 10),
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
