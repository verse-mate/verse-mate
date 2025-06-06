import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { migrateToLatest } from "./actions/migrate-deploy";
import { migrateDev } from "./actions/migrate-dev";
import { migrateDown } from "./actions/migrate-down";

yargs(hideBin(process.argv))
  .option("path", {
    alias: "path",
    type: "string",
    description: "migration folder path",
  })
  .command(
    "migrate-deploy",
    "Deploy your pending migrations to your database.",
    () => {},
    (argv) => {
      migrateToLatest(argv.path ?? path.join(import.meta.dir, "../migrations"));
    },
  )
  .command(
    "migrate-dev",
    "Create a migration empty migration.",
    () => {},
    () => {
      migrateDev();
    },
  )
  .command(
    "migrate-down",
    "Reverts the most recent migration changes from the database.",
    () => {},
    (argv) => {
      migrateDown(argv.path ?? path.join(import.meta.dir, "../migrations"));
    },
  )

  .demandCommand(1)
  .parse();
